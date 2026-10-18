import { RULE_IDS, buildRules, resolveEngine } from './engines.js';
import { getEngineSetting, onEngineSettingChanged } from './settings.js';

// Dynamic rules persist across restarts; re-applying keeps them in sync with
// storage after installs, updates, and changes synced from other devices.
async function applyEngine() {
  const engine = resolveEngine(await getEngineSetting());
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: RULE_IDS,
    addRules: buildRules(engine),
  });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await applyEngine();
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(applyEngine);
onEngineSettingChanged(applyEngine);
