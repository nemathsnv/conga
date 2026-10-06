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
