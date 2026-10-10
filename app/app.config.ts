import type { ConfigContext, ExpoConfig } from 'expo/config';

// Google Sign-In's config plugin needs the reversed iOS client id at prebuild time.
// Without Google credentials the plugin is left out so the project still builds;
// the Google button then fails with a configuration error instead of a fake success.
const googleIosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;

function googleSignInPlugin(iosUrlScheme: string): [string, Record<string, unknown>] {
  return ['@react-native-google-signin/google-signin', { iosUrlScheme }];
}

// iOS shows one string per capability however many plugins set it, so the camera string
// covers both uses (recording and the profile photo). Android has no usage strings.
// Founder-only iPhone build (scripts/founder-ios.sh), signed by a free Personal Team, which
// cannot hold Sign in with Apple or push: both are left out, under its own bundle id, and it
// must point at the hosted project. Unset for every other build, which stays as it is.
const founderBuild = process.env.EXPO_PUBLIC_FOUNDER_BUILD === '1';
if (founderBuild) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) || !key.startsWith('sb_publishable_')) {
    throw new Error('Founder build needs the hosted EXPO_PUBLIC_SUPABASE_URL and the sb_publishable_ key (app/.env.founder).');
  }
}

const CAMERA_USAGE = 'Shortcut uses the camera to record your video responses and video replies, and to take your profile photo.';
const MICROPHONE_USAGE = 'Shortcut uses the microphone to record the sound of your video responses and video replies.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Shortcut',
  slug: 'shortcut',
  scheme: 'shortcut',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  // Store builds (phase 7): EAS profiles in eas.json; build numbers are kept on EAS
  // ("appVersionSource": "remote") and the project id arrives with `eas init` (docs/BLOCKERS.md B-4).
  ios: {
    bundleIdentifier: founderBuild ? 'app.shortcut.founder' : 'app.shortcut',
    buildNumber: '1',
    supportsTablet: false,
    appleTeamId: process.env.APPLE_TEAM_ID,
    usesAppleSignIn: !founderBuild,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: [],
    },
  },
  android: {
    package: 'app.shortcut',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#000000',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    ...(founderBuild ? [] : ['expo-apple-authentication']),
    'expo-web-browser',
    [
      'expo-image-picker',
      {
        photosPermission: 'Shortcut uses your photo library when you choose a profile photo.',
        cameraPermission: CAMERA_USAGE,
      },
    ],
    // No splash board exists: plain black with a transparent image (Android needs a drawable).
    [
      'expo-camera',
      {
        cameraPermission: CAMERA_USAGE,
        microphonePermission: MICROPHONE_USAGE,
        recordAudioAndroid: true,
      },
    ],
    'expo-video',
    ['expo-splash-screen', { backgroundColor: '#000000', image: './assets/splash-blank.png', imageWidth: 1 }],
    './plugins/withSceneLifecycle.js',
    ...(googleIosUrlScheme ? [googleSignInPlugin(googleIosUrlScheme)] : []),
    ...(founderBuild ? ['./plugins/withoutPersonalTeamCapabilities.js'] : []),
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
});
