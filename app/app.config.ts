import type { ConfigContext, ExpoConfig } from 'expo/config';

// Google Sign-In's config plugin needs the reversed iOS client id at prebuild time.
// Without Google credentials the plugin is left out so the project still builds;
// the Google button then fails with a configuration error instead of a fake success.
const googleIosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;

function googleSignInPlugin(iosUrlScheme: string): [string, Record<string, unknown>] {
  return ['@react-native-google-signin/google-signin', { iosUrlScheme }];
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Shortcut',
  slug: 'shortcut',
  scheme: 'shortcut',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'app.shortcut',
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
        cameraPermission: 'Shortcut uses the camera when you take a profile photo.',
      },
    ],
    // No splash board exists: plain black with a transparent image (Android needs a drawable).
    ['expo-splash-screen', { backgroundColor: '#000000', image: './assets/splash-blank.png', imageWidth: 1 }],
    './plugins/withSceneLifecycle.js',
    ...(googleIosUrlScheme ? [googleSignInPlugin(googleIosUrlScheme)] : []),
  ],
  experiments: {
    typedRoutes: true,
  },
});
