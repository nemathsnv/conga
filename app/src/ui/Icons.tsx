// Line icons copied path for path from the approved boards.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconProps = { size?: number; color?: string; strokeWidth?: number };

export function ChevronLeft({ size = 22, color = '#1C1C1E', strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m15 5-7 7 7 7" />
    </Svg>
  );
}

export function PersonIcon({ size = 26, color = '#1C1C1E', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="8.5" r="3.8" />
      <Path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

export function CheckIcon({ size = 14, color = '#34A853', strokeWidth = 2.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function CameraIcon({ size = 20, color = '#1C1C1E', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="M4 8.5h3l1.5-2.5h7L17 8.5h3V19H4z" />
      <Circle cx="12" cy="13.5" r="3.2" />
    </Svg>
  );
}

export function LibraryIcon({ size = 20, color = '#1C1C1E', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <Circle cx="9" cy="10" r="1.6" />
      <Path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" />
    </Svg>
  );
}

export function PromptBubbleIcon({ size = 15, color = '#FFFFFF', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 19.5l1-4.1A8 8 0 1 1 20 11.5z" />
    </Svg>
  );
}

// Tab bar icons (Main, R-Discover boards). "on" uses the filled variant.
export function HomeTabIcon({ color, on }: { color: string; on: boolean }) {
  return on ? (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill={color}>
      <Path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z" />
    </Svg>
  ) : (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round">
      <Path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z" />
    </Svg>
  );
}

export function DiscoverTabIcon({ color, on }: { color: string; on: boolean }) {
  return on ? (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill={color}>
      <Path fillRule="evenodd" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3 6-1.8 4.2L9 15l1.8-4.2z" />
    </Svg>
  ) : (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round">
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="m15 9-1.8 4.2L9 15l1.8-4.2z" />
    </Svg>
  );
}

export function PlusIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round">
      <Path d="M12 6v12M6 12h12" />
    </Svg>
  );
}

export function ActivityTabIcon({ color, on }: { color: string; on: boolean }) {
  return on ? (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill={color}>
      <Path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z" />
      <Path d="M10 20.5a2 2 0 0 0 4 0z" />
    </Svg>
  ) : (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round">
      <Path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z" />
      <Path d="M10 20.5a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function MeTabIcon({ color, on }: { color: string; on: boolean }) {
  return (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill={on ? color : 'none'} stroke={color} strokeWidth={1.6} strokeLinecap="round">
      <Circle cx="12" cy="8.5" r="3.8" />
      <Path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

// Phase 3 icons, path for path from the boards (Main, R-Record, R-Player, PR-*, R-Profile).
export function HeartIcon({ size = 30, color = '#FFFFFF', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.6} strokeLinejoin="round">
      <Path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.4-7.5 10.4z" />
    </Svg>
  );
}

export function CommentIcon({ size = 29, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round">
      <Path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 19.5l1-4.1A8 8 0 1 1 20 11.5z" />
    </Svg>
  );
}

export function VideoReplyIcon({ size = 30, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round">
      <Rect x="3" y="6.5" width="12.5" height="11" rx="3" />
      <Path d="m15.5 10.5 5-2.8v8.6l-5-2.8" />
    </Svg>
  );
}

export function ShareIcon({ size = 28, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3.5v11.5" />
      <Path d="M7.5 8 12 3.5 16.5 8" />
      <Path d="M5.5 13v6.5h13V13" />
    </Svg>
  );
}

export function MoreIcon({ size = 28, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx="5" cy="12" r="2" />
      <Circle cx="12" cy="12" r="2" />
      <Circle cx="19" cy="12" r="2" />
    </Svg>
  );
}

export function RecordDotIcon({ size = 15, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Circle cx="12" cy="12" r="8" />
      <Circle cx="12" cy="12" r="3.6" fill={color} stroke="none" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 14, color = '#FFFFFF', strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function ChevronUpIcon({ size = 16, color = '#FFFFFF', strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m6 15 6-6 6 6" />
    </Svg>
  );
}

export function SearchIcon({ size = 21, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Circle cx="11" cy="11" r="6.5" />
      <Path d="m20 20-4.2-4.2" />
    </Svg>
  );
}

export function CloseIcon({ size = 20, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <Path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function FlipIcon({ size = 20, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8.5h3l1.5-2.5h7L17 8.5h3V19H4z" />
      <Path d="M9.5 13.5a2.5 2.5 0 0 1 4.3-1.8" />
      <Path d="M14.5 13.5a2.5 2.5 0 0 1-4.3 1.8" />
      <Path d="m13 10.5 1 1.3-1.6.4" />
      <Path d="m11 16.5-1-1.3 1.6-.4" />
    </Svg>
  );
}

export function LightIcon({ size = 20, color = '#FFFFFF', on = false }: IconProps & { on?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={on ? color : 'none'} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H13z" />
    </Svg>
  );
}

export function PinIcon({ size = 16, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M14 3.5 20.5 10l-2 .6-3.4 3.4.4 4.5-1.6 1.6-4.2-4.2L5 20.5l-1.5-1.5 4.6-4.7L4 10.1l1.6-1.6 4.5.4L13.5 5.5z" />
    </Svg>
  );
}

export function PlacePinIcon({ size = 13, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.4 6.5 11 6.5 11z" />
      <Circle cx="12" cy="10" r="2.3" />
    </Svg>
  );
}

export function GearIcon({ size = 22, color = '#1C1C1E' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  );
}

export function PlayIcon({ size = 24, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M7 4.5v15l12-7.5z" />
    </Svg>
  );
}

export function PlusSlotIcon({ size = 16, color = 'rgba(255,255,255,0.75)' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <Path d="M12 6v12M6 12h12" />
    </Svg>
  );
}
