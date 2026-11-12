// Board R-Record (recording a response), with A-Camera (camera access off), A-Mic
// (microphone access off) and PR-Short (under 2 seconds). SPEC.md Section 6.
// With ?replyTo=<video id>: board Record-Reply (recording a video reply), SPEC.md Section 7.
// With ?draftFor=<suggestion id>: the private first response for a suggestion in review
// (SPEC.md Section 12); the suggestion's text stands in for the prompt.
// The flip works during a take (docs/BLOCKERS.md B-1): each camera records a segment, the timer and
// the ring run on the total, and Post Review stitches the segments into one clip (video/stitch.ts).
// Zoom (founder iPhone test, 19 Oct): pinch anywhere on the preview, or tap the zoom button above
// Record (1× / 2×), before or during a take; a flip starts the other camera at 1× (video/zoom.ts).
// The flip button sits beside Record, as on the iPhone camera, not top right (same brief).
// Pause and Resume (Nemat, 19 Oct 2026): during a take the centre button pauses and resumes; Stop is
// the left button and ends the take for Post Review; Light moves to the top right so it stays in
// reach in every state. Only recorded time counts (the timer, the ring, the 30 seconds); each
// stretch is a segment, stitched on Post Review like a flip's. Leaving the app or a camera
// interruption pauses the take and keeps what was recorded; Cancel with a take asks first
// (PR-Discard's words). NOT ON A BOARD: these controls and the paused timer need Nemat's approval.
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { track } from '@/lib/analytics';
import { getPrompt, getSuggestion, getVideo, type PromptCard, type Video } from '@/lib/content';
import { ActionSheet } from '@/ui/ActionSheet';
import { OverlaySheet } from '@/ui/OverlaySheet';
import { ReplyCard } from '@/ui/ReplyCard';
import { Button, Glass } from '@/ui/components';
import { GlassTool } from '@/ui/dark';
import { CameraOffIcon, CloseIcon, FlipIcon, LightIcon, MicOffIcon } from '@/ui/Icons';
import { createLiveValue, useProgress, type ProgressSource } from '@/ui/progress';
import { colors, fontFamily, type } from '@/ui/theme';
import { formatTimer } from '@/video/limits';
import {
  CAMERA_SWITCH_TIMEOUT_MS,
  createTake,
  deleteFileQuietly,
  finalizeTakeSegments,
  keepTakeSegment,
  makeRecording,
  PAUSE_MIN_SEGMENT_MS,
  sweepTakeFolder,
  type Take,
  type TakeOutcome,
} from '@/video/recorder';
import { permissionStep } from '@/video/permissions';
import { getCurrentRecording, setCurrentRecording } from '@/video/recordingStore';
import { MAX_DURATION_MS, RECORDING_SETTINGS, type CameraFacing } from '@/video/types';
import { cameraZoom, formatZoom, pinchFactor, toggledFactor, zoomRangeFor, type ZoomRange } from '@/video/zoom';

import { maxZoomFactor } from '../../../modules/camera-zoom';

const RING = 84;
const RING_STROKE = 3.5;

/** Distance between the first two fingers of a touch. */
function fingerSpread(e: GestureResponderEvent): number | null {
  const [a, b] = e.nativeEvent.touches;
  if (!a || !b) return null;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { promptId, replyTo, draftFor } = useLocalSearchParams<{ promptId: string; replyTo?: string; draftFor?: string }>();
  const [prompt, setPrompt] = useState<PromptCard | null>(null);
  const [target, setTarget] = useState<Video | null>(null);
  const [camera, requestCamera, getCamera] = useCameraPermissions();
  const [mic, requestMic, getMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraFacing>('front');
  const [light, setLight] = useState(false);
  // Back-camera light is the torch; the front camera has none, so its light is a screen fill.
  // expo-camera drops the torch when recording starts, so it is blinked off and on after start.
  const [torchBlink, setTorchBlink] = useState(false);
  const torch = light && facing === 'back' && !torchBlink;
  // The take in progress (one segment per stretch recorded); null between takes.
  const take = useRef<Take | null>(null);
  // What the controls show: no take, recording, or paused (by Pause or an interruption). Set when the
  // take's phase changes, never by the timer.
  const [mode, setMode] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [resumable, setResumable] = useState(false);
  const recording = mode !== 'idle';
  // Cancel (or Android Back) with a take: PR-Discard's question first; the take waits, paused.
  const [discardAsk, setDiscardAsk] = useState(false);
  // The take's elapsed time, read only by the timer and the ring (TakeTimer, RecordRing): set ten
  // times a second, it re-rendered the whole screen, the camera view included, during a take.
  const [elapsed] = useState(() => createLiveValue(0));
  const [shortToast, setShortToast] = useState(false);
  const [ready, setReady] = useState(false);
  // iOS: expo-camera reports ready only when its view mounts, so a flip during a take mounts a
  // fresh CameraView (as at the first segment) to know when the other camera can record.
  const [cameraKey, setCameraKey] = useState(0);
  const cam = useRef<CameraView>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraReadyWaiter = useRef<{ resolve: () => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> } | null>(null);
  // Zoom: the factor shown on the button and expo-camera's value for it. The camera's range is read
  // when a pinch or a tap starts (the session has set the camera's format by then).
  const [zoom, setZoom] = useState({ factor: 1, camera: RECORDING_SETTINGS.zoom });
  const pinch = useRef<{ startSpread: number; startFactor: number; range: ZoomRange | null } | null>(null);
  const zoomFactor = useRef(1);
  const readZoomRange = () => zoomRangeFor(Platform.OS, maxZoomFactor(facing));
  const setZoomFactor = (factor: number, range: ZoomRange | null) => {
    zoomFactor.current = factor;
    setZoom({ factor, camera: cameraZoom(factor, range) });
  };
  // Each camera starts at 1×; a pinch in progress belongs to the camera it started on.
  const resetZoom = useCallback(() => {
    pinch.current = null;
    zoomFactor.current = 1;
    setZoom({ factor: 1, camera: RECORDING_SETTINGS.zoom });
  }, []);

  useEffect(() => {
    if (draftFor) {
      getSuggestion(draftFor)
        .then((sg) => setPrompt({ id: `draft:${sg.id}`, text: sg.text, place: sg.place, featured_on: null, published_at: null, response_count: 0, faces: [] }))
        .catch((e) => console.error('get_suggestion failed', e));
      return;
    }
    if (promptId) void getPrompt(promptId).then(setPrompt).catch((e) => console.error('get_prompt failed', e));
  }, [promptId, draftFor]);
  useEffect(() => {
    if (!replyTo) return;
    getVideo(replyTo)
      .then((v) => {
        if ('status' in v && v.status === 'unavailable') router.back();
        else setTarget(v as Video);
      })
      .catch((e) => console.error('get_video failed', e));
  }, [replyTo, router]);

  const cameraStep = permissionStep(camera);
  const micStep = permissionStep(mic);
  useEffect(() => {
    if (cameraStep === 'ask') void requestCamera();
  }, [cameraStep, requestCamera]);
  useEffect(() => {
    if (cameraStep === 'granted' && micStep === 'ask') void requestMic();
  }, [cameraStep, micStep, requestMic]);
  // Back from Settings (A-Camera, A-Mic): read both again. Android does not restart the app when
  // access is turned on there, and the permission hooks only read on mount.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void getCamera();
      void getMic();
    });
    return () => sub.remove();
  }, [getCamera, getMic]);

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  // Read when each segment starts, so the light can be changed during a take.
  const lightOn = useRef(light);
  useEffect(() => {
    lightOn.current = light;
  }, [light]);
  const blinkTorchIfBack = useCallback((segmentFacing: CameraFacing) => {
    if (!lightOn.current || segmentFacing !== 'back') return;
    setTimeout(() => {
      setTorchBlink(true);
      setTimeout(() => setTorchBlink(false), 50);
    }, RECORDING_SETTINGS.torchReapplyMs);
  }, []);

  /** Switches camera mid-take; resolves on the other camera's onCameraReady. */
  const switchCamera = useCallback((to: CameraFacing) => new Promise<void>((resolve, reject) => {
    const previous = cameraReadyWaiter.current;
    if (previous) {
      clearTimeout(previous.timeout);
      previous.reject(new Error('camera_switch_superseded'));
    }
    const timeout = setTimeout(() => {
      if (cameraReadyWaiter.current?.timeout === timeout) {
        cameraReadyWaiter.current = null;
        reject(new Error('camera_switch_timeout'));
      }
    }, CAMERA_SWITCH_TIMEOUT_MS);
    cameraReadyWaiter.current = { resolve, reject, timeout };
    setReady(false);
    resetZoom();
    setFacing(to);
    if (Platform.OS === 'ios') setCameraKey((k) => k + 1);
  }), [resetZoom]);

  const onCameraReady = () => {
    setReady(true);
    const waiter = cameraReadyWaiter.current;
    if (waiter) {
      cameraReadyWaiter.current = null;
      clearTimeout(waiter.timeout);
      waiter.resolve();
    }
  };

  // iOS: a fresh CameraView (as at a flip) after the session was interrupted or a segment failed,
  // so Resume starts on a camera that has reported ready. Android's CameraX rebinds by itself.
  const restartCamera = useCallback(() => {
    if (Platform.OS !== 'ios' || AppState.currentState !== 'active') return;
    setReady(false);
    setCameraKey((k) => k + 1);
  }, []);

  const start = useCallback(() => {
    if (!cam.current || !ready || take.current || !prompt || (replyTo && !target)) return;
    const kind = draftFor ? 'draft' : replyTo ? 'reply' : 'response';
    // Files of a take the app was closed in the middle of belong to no recording.
    sweepTakeFolder(getCurrentRecording()?.recording.segments.map((sg) => sg.uri) ?? []);
    const finished = (outcome: TakeOutcome) => {
      take.current = null;
      stopTimer();
      setMode('idle');
      setDiscardAsk(false);
      if (outcome.kind === 'short') {
        // PR-Short: the clip does not reach review.
        setShortToast(true);
        setTimeout(() => setShortToast(false), 2200);
        return;
      }
      if (outcome.kind === 'failed') {
        console.error('recordAsync failed', outcome.error);
        return;
      }
      if (outcome.kind === 'cancelled') return;
      track('record_completed', { kind, duration_s: Math.round(outcome.durationMs / 1000) });
      let segments;
      try {
        segments = finalizeTakeSegments(outcome.segments);
      } catch (e) {
        console.error('keeping the recording failed', e);
        outcome.segments.forEach((sg) => deleteFileQuietly(sg.uri));
        return;
      }
      setCurrentRecording({ recording: makeRecording(prompt.id, segments), prompt, replyTo: target ?? undefined, draftFor: draftFor ?? undefined });
      router.replace('/record/review');
    };
    const t = createTake(facing, {
      record: (maxDurationSeconds) => {
        if (!cam.current) return Promise.reject(new Error('camera_unmounted'));
        blinkTorchIfBack(t.facing);
        return cam.current.recordAsync({ maxDuration: maxDurationSeconds, codec: RECORDING_SETTINGS.codec });
      },
      stopRecording: () => cam.current?.stopRecording(),
      switchCamera,
      keep: keepTakeSegment,
      discard: deleteFileQuietly,
      now: Date.now,
      platform: Platform.OS,
      onChange: () => {
        elapsed.set(t.elapsedMs());
        if (t.phase === 'done') return;
        setMode(t.paused ? 'paused' : 'recording');
        setResumable(t.canResume());
      },
      onFinish: finished,
      onInterrupted: (e) => {
        if (e !== undefined) console.warn('a segment ended with an error; the take is paused with what it has', e);
        restartCamera();
      },
    });
    take.current = t;
    setMode('recording');
    elapsed.set(0);
    track('record_started', { kind });
    timer.current = setInterval(() => {
      const ms = t.elapsedMs();
      elapsed.set(ms);
      // The 30 seconds are the total across segments; the camera's own limit is the backstop.
      if (ms >= MAX_DURATION_MS) t.stop('limit');
    }, 100);
    t.start();
  }, [ready, prompt, facing, router, replyTo, target, draftFor, switchCamera, blinkTorchIfBack, elapsed, restartCamera]);

  const stop = () => {
    take.current?.stop('stop');
  };

  // A pause in the first half second of a segment is taken when that half second is up (a shorter
  // segment may hold no frame), so a quick Pause is never lost.
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pause = useCallback(() => {
    const t = take.current;
    if (!t || t.paused) return;
    if (t.canPause()) t.pause();
    else if (t.phase === 'recording' && !pauseTimer.current) {
      pauseTimer.current = setTimeout(() => {
        pauseTimer.current = null;
        if (take.current === t) t.pause();
      }, PAUSE_MIN_SEGMENT_MS);
    }
  }, []);

  const resume = () => {
    take.current?.resume();
  };

  // Cancel: straight back with no take; with one, pause it and ask (PR-Discard's words).
  const askDiscard = useCallback(() => {
    if (!take.current) return false;
    pause();
    setDiscardAsk(true);
    return true;
  }, [pause]);

  const flip = () => {
    const t = take.current;
    if (t) t.flip();
    else {
      resetZoom();
      setFacing((f) => (f === 'front' ? 'back' : 'front'));
    }
  };

  const toggleZoom = () => {
    const range = readZoomRange();
    setZoomFactor(toggledFactor(zoomFactor.current, range), range);
  };

  // Two fingers anywhere on the preview zoom; one finger is left to the controls. The layer sits
  // under every control, so taps on Record, Light, Flip and Cancel never reach it.
  const startPinch = (e: GestureResponderEvent) => {
    const spread = fingerSpread(e);
    if (spread === null) return;
    pinch.current = { startSpread: spread, startFactor: zoomFactor.current, range: readZoomRange() };
  };
  const movePinch = (e: GestureResponderEvent) => {
    const spread = fingerSpread(e);
    if (spread === null) {
      pinch.current = null; // a finger lifted: the next two fingers start a new pinch from here
      return;
    }
    if (!pinch.current) return startPinch(e);
    const p = pinch.current;
    setZoomFactor(pinchFactor(p.startFactor, p.startSpread, spread, p.range), p.range);
  };
  const endPinch = () => {
    pinch.current = null;
  };

  const cancel = () => {
    if (askDiscard()) return;
    router.back();
  };

  const discardTake = () => {
    setDiscardAsk(false);
    take.current?.cancel();
    router.back();
  };

  // Android's Back is the X: with a take, PR-Discard first, never a silent loss of what was recorded.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (discardAsk) {
        setDiscardAsk(false);
        return true;
      }
      return askDiscard();
    });
    return () => sub.remove();
  }, [discardAsk, askDiscard]);

  // Leaving the app pauses the take and keeps what was recorded (the camera stops anyway). Back in
  // the app, iOS gets a fresh camera before Resume is offered. Closing the screen any other way
  // discards the take.
  useEffect(() => {
    let wasInBackground = false;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        wasInBackground = true;
        take.current?.stop('interrupted');
      } else if (state === 'active' && wasInBackground) {
        wasInBackground = false;
        if (take.current) restartCamera();
      }
    });
    return () => {
      sub.remove();
      take.current?.cancel();
      stopTimer();
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      const waiter = cameraReadyWaiter.current;
      if (waiter) clearTimeout(waiter.timeout);
    };
  }, [restartCamera]);

  const cameraOff = cameraStep === 'off';
  const micOff = cameraStep === 'granted' && micStep === 'off';
  useEffect(() => {
    if (cameraOff) track('permission_denied', { permission: 'camera' });
  }, [cameraOff]);
  useEffect(() => {
    if (micOff) track('permission_denied', { permission: 'microphone' });
  }, [micOff]);

  const rootName = target?.context.kind === 'reply' ? target.context.root?.author.name ?? null : null;
  const promptCard = replyTo ? (
    // Board Record-Reply: who you reply to, their caption, the room, the limit.
    <ReplyCard
      kicker="Replying to"
      name={target?.author.name ?? null}
      caption={target?.caption ?? null}
      captionLines={1}
      captionBold
      sub={`${rootName ? `In replies to ${rootName} · ` : ''}up to 30 seconds`}
      playbackId={target?.playback_id ?? null}
      style={{ position: 'absolute', alignSelf: 'center', width: 316, top: insets.top + 61, paddingRight: 14 }}
    />
  ) : (
    <Glass style={[s.promptCard, { top: insets.top + 61 }]}>
      <Text style={s.promptText}>{prompt?.text ?? ''}</Text>
      <Text style={s.promptSub}>Responding · up to 30 seconds</Text>
    </Glass>
  );

  const header = (
    <View style={[s.header, { top: insets.top + 3 }]}>
      <GlassTool label="Cancel" onPress={cancel}>
        <CloseIcon />
      </GlassTool>
      {mode === 'recording' ? (
        <View style={s.timer} accessibilityLabel="Recording">
          <View style={s.timerDot} />
          <TakeTimer elapsed={elapsed} />
        </View>
      ) : mode === 'paused' ? (
        // Paused: grey, not red, with the word, so it never reads as recording.
        <Glass style={s.timerPaused} radius={15}>
          <PauseGlyph size={10} color={colors.white} />
          <Text style={s.timerText}>Paused</Text>
          <Text style={s.timerTextDim}>·</Text>
          <TakeTimer elapsed={elapsed} />
        </Glass>
      ) : (
        <View />
      )}
      {/* Light, top right: in reach before and during a take (the flip is beside Record). */}
      <GlassTool label={light ? 'Light, on' : 'Light, off'} onPress={() => setLight((v) => !v)}>
        <LightIcon on={light} />
      </GlassTool>
    </View>
  );

  if (cameraOff) {
    // Board A-Camera
    return (
      <View style={[s.root, { backgroundColor: '#111113' }]}>
        <StatusBar style="light" />
        <View style={[s.header, { top: insets.top + 3 }]}>
          <GlassTool label="Cancel" onPress={() => router.back()}>
            <CloseIcon />
          </GlassTool>
          <View />
          <GlassTool label="Flip camera" disabled>
            <FlipIcon />
          </GlassTool>
        </View>
        {promptCard}
        <View style={s.stateBlock}>
          <Glass style={s.stateIcon} radius={32}>
            <CameraOffIcon size={28} />
          </Glass>
          <Text style={s.stateTitle}>Camera access is off</Text>
          <Text style={s.stateText}>Responses are recorded on video. Turn on camera access for Conga in your phone&apos;s settings.</Text>
          <Button title="Open Settings" variant="white" onPress={() => void Linking.openSettings()} style={{ marginTop: 24, height: 48, paddingHorizontal: 24 }} />
          <Button title="Not now" variant="textOnDark" onPress={() => router.back()} style={{ marginTop: 8, height: 40 }} textStyle={{ color: 'rgba(255,255,255,0.8)' }} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      {camera?.granted ? (
        <CameraView
          key={cameraKey}
          ref={cam}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          videoQuality={RECORDING_SETTINGS.videoQuality}
          videoBitrate={RECORDING_SETTINGS.videoBitrate}
          zoom={zoom.camera}
          enableTorch={torch}
          mute={false}
          mirror={facing === 'front'}
          onCameraReady={onCameraReady}
        />
      ) : null}
      {/* Front "light": a screen-fill treatment (phase 1 condition). */}
      {light && facing === 'front' ? <View pointerEvents="none" style={s.screenFill} /> : null}
      <View pointerEvents="none" style={[s.gradient, { top: 0, height: 240, backgroundColor: 'transparent' }]}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} />
      </View>
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={(e) => e.nativeEvent.touches.length >= 2}
        onMoveShouldSetResponder={(e) => e.nativeEvent.touches.length >= 2}
        onResponderGrant={startPinch}
        onResponderMove={movePinch}
        onResponderRelease={endPinch}
        onResponderTerminate={endPinch}
        onResponderTerminationRequest={() => false}
      />
      {header}
      {/* The card takes no touches, so a pinch over it still zooms. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {promptCard}
      </View>

      {micOff ? (
        // Board A-Mic: the preview stays, recording is unavailable.
        <Glass style={s.micCard}>
          <View style={s.micRow}>
            <View style={s.micIcon}>
              <MicOffIcon size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.micTitle}>Microphone access is off</Text>
              <Text style={s.micText}>Your response would have no sound. Turn it on in your phone&apos;s settings.</Text>
              <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={({ pressed }) => [s.micButton, pressed && { opacity: 0.7 }]}>
                <Text style={s.micButtonText}>Open Settings</Text>
              </Pressable>
            </View>
          </View>
        </Glass>
      ) : null}

      {shortToast ? (
        <Glass style={[s.toast, { bottom: Math.max(insets.bottom, 12) + 34 + RING + 14 + 32 + 12 }]} radius={20}>
          <Text style={s.toastText}>Keep going: responses are at least 2 seconds</Text>
        </Glass>
      ) : null}

      <View style={[s.controls, { bottom: Math.max(insets.bottom, 12) + 34 }]}>
        {recording ? (
          // Stop: left of the centre button, away from the thumb that pauses and resumes.
          <GlassTool label="Stop recording" onPress={stop}>
            <View style={s.stopGlyph} />
          </GlassTool>
        ) : (
          <View style={s.slot} />
        )}
        <RecordButton
          elapsed={elapsed}
          mode={mode}
          micOff={micOff}
          disabled={mode === 'idle' ? micOff || !ready : mode === 'paused' ? !resumable || !ready : false}
          onPress={mode === 'idle' ? start : mode === 'recording' ? pause : resume}
        />
        {/* Flip works during a take too (SPEC.md Section 6; Nemat, 6 Oct; docs/BLOCKERS.md B-1). */}
        <GlassTool label="Flip camera" onPress={flip}>
          <FlipIcon />
        </GlassTool>
      </View>
      <View pointerEvents="box-none" style={[s.zoomRow, { bottom: Math.max(insets.bottom, 12) + 34 + RING + 14 }]}>
        <GlassTool label={`Zoom ${formatZoom(zoom.factor)}`} onPress={toggleZoom} style={s.zoomTool}>
          <Text style={s.zoomText}>{formatZoom(zoom.factor)}</Text>
        </GlassTool>
      </View>
      <Text style={[s.upTo, { bottom: Math.max(insets.bottom, 12) + 6 }]}>Up to 0:30</Text>

      {/* PR-Discard's question for Cancel during a take (an overlay, never a <Modal>: ui/OverlaySheet.tsx) */}
      <OverlaySheet visible={discardAsk} onRequestClose={() => setDiscardAsk(false)}>
        <ActionSheet
          title="Discard this recording?"
          lines={["It won't be saved anywhere."]}
          actions={[{ label: 'Discard', destructive: true, onPress: discardTake }]}
          onCancel={() => setDiscardAsk(false)}
        />
      </OverlaySheet>
    </View>
  );
}

/** The red timer's text during a take. */
function TakeTimer({ elapsed }: { elapsed: ProgressSource }) {
  return <Text style={s.timerText}>{formatTimer(useProgress(elapsed))}</Text>;
}

/** Two rounded bars: the pause sign. */
function PauseGlyph({ size, color }: { size: number; color: string }) {
  const bar = { width: Math.max(2, Math.round(size * 0.3)), height: size, borderRadius: size * 0.12, backgroundColor: color };
  return (
    <View style={{ flexDirection: 'row', gap: Math.round(size * 0.3) }}>
      <View style={bar} />
      <View style={bar} />
    </View>
  );
}

/**
 * The centre button and its ring: Record (red dot), Pause (red disc with the pause sign) while
 * recording, Resume (red dot again) while paused. The ring shows the recorded total of 30 seconds
 * and holds still while paused. The only part of the controls drawn as the take runs.
 */
function RecordButton({ elapsed, mode, micOff, disabled, onPress }: { elapsed: ProgressSource; mode: 'idle' | 'recording' | 'paused'; micOff: boolean; disabled: boolean; onPress: () => void }) {
  const elapsedMs = useProgress(elapsed);
  const progress = elapsedMs / MAX_DURATION_MS;
  const circumference = Math.PI * (RING - RING_STROKE);
  const seconds = `${Math.round(elapsedMs / 1000)} of 30 seconds`;
  const label = mode === 'recording' ? `Pause recording, ${seconds}` : mode === 'paused' ? `Resume recording, ${seconds} recorded` : micOff ? 'Record, unavailable' : 'Record';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={s.recordButton}>
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        <Circle cx={RING / 2} cy={RING / 2} r={(RING - RING_STROKE) / 2} stroke={mode !== 'idle' || micOff ? 'rgba(255,255,255,0.35)' : '#FFFFFF'} strokeWidth={RING_STROKE} fill="none" />
        {mode !== 'idle' ? (
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={(RING - RING_STROKE) / 2}
            stroke="#FFFFFF"
            strokeWidth={RING_STROKE}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        ) : null}
      </Svg>
      {mode === 'recording' ? (
        <View style={s.pauseDisc}>
          <PauseGlyph size={24} color={colors.white} />
        </View>
      ) : (
        <View style={[s.recordDot, (micOff || disabled) && { opacity: 0.35 }]} />
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  gradient: { position: 'absolute', left: 0, right: 0 },
  screenFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.88)' },
  header: { position: 'absolute', left: 12, right: 12, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timer: { height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: colors.dangerBorder, flexDirection: 'row', alignItems: 'center', gap: 6 },
  timerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  timerText: { ...type.semi14, color: colors.white, fontFamily, fontVariant: ['tabular-nums'] },
  promptCard: { position: 'absolute', alignSelf: 'center', width: 300, paddingTop: 10, paddingBottom: 11, paddingHorizontal: 16, alignItems: 'center' },
  promptText: { fontSize: 17, lineHeight: 21, fontWeight: '600', letterSpacing: -0.3, color: colors.white, textAlign: 'center', fontFamily },
  promptSub: { ...type.caption13, marginTop: 3, color: 'rgba(255,255,255,0.82)', fontFamily },
  controls: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 46 },
  recordButton: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  recordDot: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.dangerBorder },
  pauseDisc: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.dangerBorder, alignItems: 'center', justifyContent: 'center' },
  stopGlyph: { width: 16, height: 16, borderRadius: 4, backgroundColor: colors.dangerBorder },
  slot: { width: 44, height: 44 },
  timerPaused: { height: 30, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  timerTextDim: { ...type.semi14, color: 'rgba(255,255,255,0.6)', fontFamily },
  zoomRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  zoomTool: { width: 48, height: 32, borderRadius: 16 },
  zoomText: { ...type.semi14, color: colors.white, fontFamily, fontVariant: ['tabular-nums'] },
  upTo: { position: 'absolute', left: 0, right: 0, textAlign: 'center', ...type.caption12, color: colors.white72, fontFamily, fontVariant: ['tabular-nums'] },
  stateBlock: { position: 'absolute', left: 32, right: 32, top: 300, alignItems: 'center' },
  stateIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { marginTop: 18, fontSize: 22, lineHeight: 27, fontWeight: '600', letterSpacing: -0.4, color: colors.white, textAlign: 'center', fontFamily },
  stateText: { marginTop: 8, ...type.label15, lineHeight: 21, color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontFamily },
  micCard: { position: 'absolute', left: 16, right: 16, top: 520, padding: 14 },
  micRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  micIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  micTitle: { ...type.semi15, color: colors.white, fontFamily },
  micText: { ...type.caption13, marginTop: 2, color: 'rgba(255,255,255,0.78)', fontFamily },
  micButton: { alignSelf: 'flex-start', marginTop: 10, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.white, justifyContent: 'center' },
  micButtonText: { ...type.semi14, color: colors.black, fontFamily },
  toast: { position: 'absolute', alignSelf: 'center', height: 40, paddingHorizontal: 16, justifyContent: 'center' },
  toastText: { ...type.semi14, color: colors.white, fontFamily },
});
