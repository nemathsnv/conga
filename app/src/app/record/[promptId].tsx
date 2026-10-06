// Board R-Record (recording a response), with A-Camera (camera access off), A-Mic
// (microphone access off) and PR-Short (under 2 seconds). SPEC.md Section 6.
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { getPrompt, type PromptCard } from '@/lib/content';
import { Button, Glass } from '@/ui/components';
import { GlassTool } from '@/ui/dark';
import { CloseIcon, FlipIcon, LightIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';
import { formatTimer, isTooShort } from '@/video/limits';
import { keepSegment, makeRecording } from '@/video/recorder';
import { setCurrentRecording } from '@/video/recordingStore';
import { MAX_DURATION_MS, RECORDING_SETTINGS, type CameraFacing } from '@/video/types';

const RING = 84;
const RING_STROKE = 3.5;

export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { promptId } = useLocalSearchParams<{ promptId: string }>();
  const [prompt, setPrompt] = useState<PromptCard | null>(null);
  const [camera, requestCamera] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraFacing>('front');
  const [light, setLight] = useState(false);
  // Back-camera light is the torch; the front camera has none, so its light is a screen fill.
  // expo-camera drops the torch when recording starts, so it is blinked off and on after start.
  const [torchBlink, setTorchBlink] = useState(false);
  const torch = light && facing === 'back' && !torchBlink;
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [shortToast, setShortToast] = useState(false);
  const [ready, setReady] = useState(false);
  const cam = useRef<CameraView>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (promptId) void getPrompt(promptId).then(setPrompt).catch((e) => console.error('get_prompt failed', e));
  }, [promptId]);

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

  const start = useCallback(async () => {
    if (!cam.current || !ready || recording || !prompt) return;
    setRecording(true);
    startedAt.current = Date.now();
    setElapsedMs(0);
    timer.current = setInterval(() => setElapsedMs(Math.min(MAX_DURATION_MS, Date.now() - startedAt.current)), 100);
    if (light && facing === 'back') {
      setTimeout(() => {
        setTorchBlink(true);
        setTimeout(() => setTorchBlink(false), 50);
      }, RECORDING_SETTINGS.torchReapplyMs);
    }
    try {
      const result = await cam.current.recordAsync({ maxDuration: MAX_DURATION_MS / 1000, codec: RECORDING_SETTINGS.codec });
      const durationMs = Math.min(MAX_DURATION_MS, Date.now() - startedAt.current);
      stopTimer();
      setRecording(false);
      if (!result?.uri) return;
      if (isTooShort(durationMs)) {
        // PR-Short: the clip does not reach review.
        setShortToast(true);
        setTimeout(() => setShortToast(false), 2200);
        return;
      }
      const segment = keepSegment(result.uri, facing, durationMs);
      setCurrentRecording({ recording: makeRecording(prompt.id, [segment]), prompt });
      router.replace('/record/review');
    } catch (e) {
      stopTimer();
      setRecording(false);
      console.error('recordAsync failed', e);
    }
  }, [ready, recording, prompt, light, facing, router]);

  const stop = () => {
    cam.current?.stopRecording();
  };

  const cancel = () => {
    if (recording) cam.current?.stopRecording();
    router.back();
  };

  const cameraOff = camera && !camera.granted && !camera.canAskAgain;
  const micOff = !!camera?.granted && !!mic && !mic.granted && !mic.canAskAgain;
  const progress = elapsedMs / MAX_DURATION_MS;
  const circumference = Math.PI * (RING - RING_STROKE);

  const promptCard = (
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
      {/* Flip during a take is a locked requirement (SPEC.md Section 6; Nemat, 6 Oct). It needs
          segment stitching, tracked as docs/BLOCKERS.md B-1. Until it lands the control is
          disabled while recording, dimmed and announced as unavailable, so nothing pretends. */}
      <GlassTool label={recording ? 'Flip camera, unavailable while recording' : 'Flip camera'} disabled={recording} onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}>
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
            <FlipIcon size={28} />
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
          onCameraReady={() => setReady(true)}
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
              <LightIcon size={18} />
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
          disabled={micOff || !ready}
          onPress={recording ? stop : () => void start()}
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
