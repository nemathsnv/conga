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
    bundleIdentifier: 'app.shortcut',
    buildNumber: '1',
    supportsTablet: false,
    appleTeamId: process.env.APPLE_TEAM_ID,
    usesAppleSignIn: true,
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
    'expo-apple-authentication',
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
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
});
