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

// The EAS project @nemathsnv/conga (created with `eas init` on 17 Oct 2026; docs/release/OTA-UPDATES.md).
// Not a secret: it names the project for builds, updates and push tokens. EAS_PROJECT_ID overrides it.
const EAS_OWNER = 'nemathsnv';
const EAS_PROJECT = '89a7bb41-ee22-4358-9ab1-75299a5ae2f9';

/**
 * Why a build or an over-the-air update that will reach a phone must not be made with these values
 * (empty when it may). `founder`: the founder build's rules (app.config.ts top, scripts/founder-ios.sh);
 * otherwise the tester and store rules. `update`: also needs the EAS project, which the update URL names.
 */
export function releaseProblems(env: Record<string, string | undefined>, opts: { founder: boolean; update: boolean }): string[] {
  const problems: string[] = [];
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(env.EXPO_PUBLIC_SUPABASE_URL ?? '')) problems.push('EXPO_PUBLIC_SUPABASE_URL must be the hosted https://<ref>.supabase.co URL');
  if (!(env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').startsWith('sb_publishable_')) problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY must be the hosted sb_publishable_ key');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(env.EXPO_PUBLIC_WEB_BASE_URL ?? '')) problems.push('EXPO_PUBLIC_WEB_BASE_URL must be the links domain, https://<host> with no path');
  if (env.EXPO_PUBLIC_DEV_TOOLS === '1') problems.push('EXPO_PUBLIC_DEV_TOOLS must not be 1');
  if (opts.founder !== (env.EXPO_PUBLIC_FOUNDER_BUILD === '1')) problems.push(`EXPO_PUBLIC_FOUNDER_BUILD must ${opts.founder ? '' : 'not '}be 1`);
  if (opts.update && !/^[0-9a-f-]{36}$/.test(env.EAS_PROJECT_ID || EAS_PROJECT)) problems.push('EAS_PROJECT_ID must be the EAS project id');
  return problems;
}

// Store and tester builds on EAS (profiles `preview` and `production`, eas.json): fail the build,
// not the first launch, when the public values are wrong. EAS_BUILD is "true" only on the EAS build
// servers, so local prebuilds and `eas build` reading this file on a laptop are not affected.
// .env files are git-ignored and never reach EAS: the values come from eas.json `env` and the EAS
// environment variables of that profile (docs/release/BUILD.md).
const easProfile = process.env.EAS_BUILD === 'true' ? process.env.EAS_BUILD_PROFILE : undefined;
if (easProfile === 'preview' || easProfile === 'production') {
  const problems = releaseProblems(process.env, { founder: false, update: false });
  if (problems.length > 0) throw new Error(`EAS ${easProfile} build refused: ${problems.join('; ')}.`);
}

// Over-the-air updates (docs/release/OTA-UPDATES.md). The JavaScript bundle of an update is exported
// on this Mac with whatever EXPO_PUBLIC_* values the shell and the EAS environment hold, and they are
// inlined into the code phones run, so scripts/publish-update.sh sets CONGA_UPDATE_CHANNEL and the
// export stops here, before anything uploads, when they are not the values that channel's builds have.
const updateChannel = process.env.CONGA_UPDATE_CHANNEL;
if (updateChannel !== undefined) {
  const problems = ['founder', 'preview', 'production'].includes(updateChannel)
    ? releaseProblems(process.env, { founder: updateChannel === 'founder', update: true })
    : [`unknown channel "${updateChannel}"`];
  if (problems.length > 0) throw new Error(`Update for ${updateChannel} refused: ${problems.join('; ')}.`);
}

// Every build asks EAS Update for a newer JavaScript bundle at launch. The runtime version is the
// fingerprint of the native project (dependencies, config plugins, this config), computed at build
// time and again when an update is published: an update only reaches builds with the same native
// code, so any native change needs a new build. EAS builds get their channel from eas.json; the
// founder build, built on this Mac, asks for the `founder` channel. Debug builds load from Metro.
const easProjectId = process.env.EAS_PROJECT_ID || EAS_PROJECT;
const updates: ExpoConfig['updates'] = {
  enabled: true,
  url: `https://u.expo.dev/${easProjectId}`,
  checkAutomatically: 'ON_LOAD',
  fallbackToCacheTimeout: 0,
  ...(founderBuild ? { requestHeaders: { 'expo-channel-name': 'founder' } } : {}),
};

const CAMERA_USAGE = 'Conga uses the camera to record your video responses and video replies, and to take your profile photo.';
const MICROPHONE_USAGE = 'Conga uses the microphone to record the sound of your video responses and video replies.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Conga',
  slug: 'conga',
  owner: EAS_OWNER,
  scheme: 'shortcut',
  version: '0.1.0',
  orientation: 'portrait',
  runtimeVersion: { policy: 'fingerprint' },
  updates,
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
    // Not used by the app: the dev-menu overlay (template) and the pre-Android-13 storage access that
    // libraries declare. The photo library is only reached through the system picker. Fewer lines in
    // the Play permissions review and Data safety form (docs/release/ANDROID.md section 2).
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
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
        photosPermission: 'Conga uses your photo library when you choose a profile photo.',
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
    eas: { projectId: easProjectId },
  },
});
