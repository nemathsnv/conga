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

// Store and tester builds on EAS (profiles `preview` and `production`, eas.json): fail the build,
// not the first launch, when the public values are wrong. EAS_BUILD is "true" only on the EAS build
// servers, so local prebuilds and `eas build` reading this file on a laptop are not affected.
// .env files are git-ignored and never reach EAS: the values come from eas.json `env` and the EAS
// environment variables of that profile (docs/release/BUILD.md).
const easProfile = process.env.EAS_BUILD === 'true' ? process.env.EAS_BUILD_PROFILE : undefined;
if (easProfile === 'preview' || easProfile === 'production') {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const problems: string[] = [];
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url)) problems.push('EXPO_PUBLIC_SUPABASE_URL must be the hosted https://<ref>.supabase.co URL');
  if (!key.startsWith('sb_publishable_')) problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY must be the hosted sb_publishable_ key');
  if (process.env.EXPO_PUBLIC_DEV_TOOLS === '1') problems.push('EXPO_PUBLIC_DEV_TOOLS must not be 1');
  if (process.env.EXPO_PUBLIC_FOUNDER_BUILD === '1') problems.push('EXPO_PUBLIC_FOUNDER_BUILD must not be 1');
  if (problems.length > 0) throw new Error(`EAS ${easProfile} build refused: ${problems.join('; ')}.`);
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
    // FCM (push on Android): the Firebase client file, a git-ignored file supplied as an EAS file
    // variable (docs/release/ANDROID.md). Left out when unset, so builds without push still work.
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
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
