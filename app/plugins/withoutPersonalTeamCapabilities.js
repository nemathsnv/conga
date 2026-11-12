// Local config plugin, founder build only (app.config.ts): removes the two entitlements a free
// Personal Team cannot sign, push (added by expo-notifications) and Sign in with Apple (added by
// expo-apple-authentication, which Expo applies whenever it is installed). Both features stay in
// the code; the founder build hides the Apple button and never registers a push token.
const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = function withoutPersonalTeamCapabilities(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    delete c.modResults['com.apple.developer.applesignin'];
    return c;
  });
};
