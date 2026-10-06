// Local config plugin: adopt the UIKit scene lifecycle on iOS.
// iOS 27 traps at launch (EXC_BREAKPOINT in
// __UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption) for apps built with
// the iOS 27 SDK that have no scene configuration. Expo SDK 57 ships
// `ExpoAppSceneDelegate` but its template AppDelegate does not use it yet, so this
// plugin wires it up. No-op on Android.
const { withInfoPlist, withXcodeProject, withDangerousMod, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SCENE_DELEGATE = `internal import Expo
import UIKit

// Creates the window from the connecting UIWindowScene and starts React Native in it.
class SceneDelegate: ExpoAppSceneDelegate {}
`;

function withSceneManifest(config) {
  return withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate' },
        ],
      },
    };
    return c;
  });
}

function withSceneDelegateFile(config) {
  config = withDangerousMod(config, ['ios', async (c) => {
    const name = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot);
    const dir = path.join(c.modRequest.platformProjectRoot, name);
    fs.writeFileSync(path.join(dir, 'SceneDelegate.swift'), SCENE_DELEGATE);
    // AppDelegate: provide the factory to the scene delegate and stop creating the window itself.
    const appDelegatePath = path.join(dir, 'AppDelegate.swift');
    let src = fs.readFileSync(appDelegatePath, 'utf8');
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {\n  var reactNativeFactoryModuleName: String { "main" }');
      src = src.replace(/#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/, '    // The window and React Native root are created by SceneDelegate (scene lifecycle).\n');
      fs.writeFileSync(appDelegatePath, src);
    }
    return c;
  }]);
  return withXcodeProject(config, (c) => {
    const name = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot);
    const rel = path.join(name, 'SceneDelegate.swift');
    if (!c.modResults.hasFile(rel)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: rel, groupName: name, project: c.modResults });
    }
    return c;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneDelegateFile(withSceneManifest(config));
};
