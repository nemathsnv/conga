// Board R-Record (recording a response), with A-Camera (camera access off), A-Mic
// (microphone access off) and PR-Short (under 2 seconds). SPEC.md Section 6.
// With ?replyTo=<video id>: board Record-Reply (recording a video reply), SPEC.md Section 7.
// With ?draftFor=<suggestion id>: the private first response for a suggestion in review
// (SPEC.md Section 12); the suggestion's text stands in for the prompt.
// The flip works during a take (docs/BLOCKERS.md B-1): each camera records a segment, the timer and
// the ring run on the total, and Post Review stitches the segments into one clip (video/stitch.ts).
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { track } from '@/lib/analytics';
import { getPrompt, getSuggestion, getVideo, type PromptCard, type Video } from '@/lib/content';
import { ReplyCard } from '@/ui/ReplyCard';
import { Button, Glass } from '@/ui/components';
import { GlassTool } from '@/ui/dark';
import { CameraOffIcon, CloseIcon, FlipIcon, LightIcon, MicOffIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';
import { formatTimer } from '@/video/limits';
import {
  CAMERA_SWITCH_TIMEOUT_MS,
  createTake,
  deleteFileQuietly,
  finalizeTakeSegments,
  keepTakeSegment,
  makeRecording,
  sweepTakeFolder,
  type Take,
  type TakeOutcome,
} from '@/video/recorder';
import { getCurrentRecording, setCurrentRecording } from '@/video/recordingStore';
import { MAX_DURATION_MS, RECORDING_SETTINGS, type CameraFacing } from '@/video/types';

const RING = 84;
const RING_STROKE = 3.5;

export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { promptId, replyTo, draftFor } = useLocalSearchParams<{ promptId: string; replyTo?: string; draftFor?: string }>();
  const [prompt, setPrompt] = useState<PromptCard | null>(null);
  const [target, setTarget] = useState<Video | null>(null);
  const [camera, requestCamera] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraFacing>('front');
  const [light, setLight] = useState(false);
  // Back-camera light is the torch; the front camera has none, so its light is a screen fill.
  // expo-camera drops the torch when recording starts, so it is blinked off and on after start.
  const [torchBlink, setTorchBlink] = useState(false);
  const torch = light && facing === 'back' && !torchBlink;
  // The take in progress (one segment per camera); null between takes.
  const take = useRef<Take | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [shortToast, setShortToast] = useState(false);
  const [ready, setReady] = useState(false);
  // iOS: expo-camera reports ready only when its view mounts, so a flip during a take mounts a
  // fresh CameraView (as at the first segment) to know when the other camera can record.
  const [cameraKey, setCameraKey] = useState(0);
  const cam = useRef<CameraView>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraReadyWaiter = useRef<{ resolve: () => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> } | null>(null);

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

  useEffect(() => {
    if (camera && !camera.granted && camera.canAskAgain) void requestCamera();
  }, [camera, requestCamera]);
  useEffect(() => {
    if (camera?.granted && mic && !mic.granted && mic.canAskAgain) void requestMic();
  }, [camera?.granted, mic, requestMic]);

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
    setFacing(to);
    if (Platform.OS === 'ios') setCameraKey((k) => k + 1);
  }), []);

  const onCameraReady = () => {
    setReady(true);
    const waiter = cameraReadyWaiter.current;
    if (waiter) {
      cameraReadyWaiter.current = null;
      clearTimeout(waiter.timeout);
      waiter.resolve();
    }
  };

  const start = useCallback(() => {
    if (!cam.current || !ready || take.current || !prompt || (replyTo && !target)) return;
    const kind = draftFor ? 'draft' : replyTo ? 'reply' : 'response';
    // Files of a take the app was closed in the middle of belong to no recording.
    sweepTakeFolder(getCurrentRecording()?.recording.segments.map((sg) => sg.uri) ?? []);
    const finished = (outcome: TakeOutcome) => {
      take.current = null;
      stopTimer();
      setRecording(false);
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
      onChange: () => setElapsedMs(t.elapsedMs()),
      onFinish: finished,
    });
    take.current = t;
    setRecording(true);
    setElapsedMs(0);
    track('record_started', { kind });
    timer.current = setInterval(() => {
      const ms = t.elapsedMs();
      setElapsedMs(ms);
      // The 30 seconds are the total across segments; the camera's own limit is the backstop.
      if (ms >= MAX_DURATION_MS) t.stop('limit');
    }, 100);
    t.start();
  }, [ready, prompt, facing, router, replyTo, target, draftFor, switchCamera, blinkTorchIfBack]);

  const stop = () => {
    take.current?.stop('stop');
  };

  const flip = () => {
    const t = take.current;
    if (t) t.flip();
    else setFacing((f) => (f === 'front' ? 'back' : 'front'));
  };

  const cancel = () => {
    take.current?.cancel();
    router.back();
  };

  // Leaving the app ends the take with what it has (the camera stops anyway); closing the screen
  // any other way discards it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') take.current?.stop('interrupted');
    });
    return () => {
      sub.remove();
      take.current?.cancel();
      stopTimer();
      const waiter = cameraReadyWaiter.current;
      if (waiter) clearTimeout(waiter.timeout);
    };
  }, []);

  const cameraOff = camera && !camera.granted && !camera.canAskAgain;
  const micOff = !!camera?.granted && !!mic && !mic.granted && !mic.canAskAgain;
  useEffect(() => {
    if (cameraOff) track('permission_denied', { permission: 'camera' });
  }, [cameraOff]);
  useEffect(() => {
    if (micOff) track('permission_denied', { permission: 'microphone' });
  }, [micOff]);
  const progress = elapsedMs / MAX_DURATION_MS;
  const circumference = Math.PI * (RING - RING_STROKE);

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
      {recording ? (
        <View style={s.timer}>
          <View style={s.timerDot} />
          <Text style={s.timerText}>{formatTimer(elapsedMs)}</Text>
        </View>
      ) : (
        <View />
      )}
      {/* Flip works during a take too (SPEC.md Section 6; Nemat, 6 Oct; docs/BLOCKERS.md B-1). */}
      <GlassTool label="Flip camera" onPress={flip}>
        <FlipIcon />
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
          <Text style={s.stateText}>Responses are recorded on video. Turn on camera access for Shortcut in your phone&apos;s settings.</Text>
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
          zoom={RECORDING_SETTINGS.zoom}
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
      {header}
      {promptCard}

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
        <Glass style={s.toast} radius={20}>
          <Text style={s.toastText}>Keep going: responses are at least 2 seconds</Text>
        </Glass>
      ) : null}

      <View style={[s.controls, { bottom: Math.max(insets.bottom, 12) + 34 }]}>
        <GlassTool label="Light" onPress={() => setLight((v) => !v)}>
          <LightIcon on={light} />
        </GlassTool>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? `Stop recording, ${Math.round(elapsedMs / 1000)} of 30 seconds` : micOff ? 'Record, unavailable' : 'Record'}
          disabled={recording ? false : micOff || !ready}
          onPress={recording ? stop : start}
          style={s.recordButton}
        >
          <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
            <Circle cx={RING / 2} cy={RING / 2} r={(RING - RING_STROKE) / 2} stroke={recording ? 'rgba(255,255,255,0.35)' : micOff ? 'rgba(255,255,255,0.35)' : '#FFFFFF'} strokeWidth={RING_STROKE} fill="none" />
            {recording ? (
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
          {recording ? <View style={s.stopSquare} /> : <View style={[s.recordDot, micOff && { opacity: 0.35 }]} />}
        </Pressable>
        <GlassTool label="Zoom 1x">
          <Text style={s.zoomText}>1×</Text>
        </GlassTool>
      </View>
      <Text style={[s.upTo, { bottom: Math.max(insets.bottom, 12) + 6 }]}>Up to 0:30</Text>
    </View>
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
  stopSquare: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.dangerBorder },
  zoomText: { ...type.semi14, color: colors.white, fontFamily },
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
  toast: { position: 'absolute', alignSelf: 'center', top: 646, height: 40, paddingHorizontal: 16, justifyContent: 'center' },
  toastText: { ...type.semi14, color: colors.white, fontFamily },
});
