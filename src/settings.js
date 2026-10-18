import { DEFAULT_SETTING } from './engines.js';

// The engine choice lives in storage.sync so it follows the user's Edge profile.
const KEY = 'engine';

export async function getEngineSetting() {
  const { [KEY]: setting } = await chrome.storage.sync.get(KEY);
  return setting ?? DEFAULT_SETTING;
}

export async function setEngineSetting(setting) {
  await chrome.storage.sync.set({ [KEY]: setting });
}

export function onEngineSettingChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && KEY in changes) callback();
  });
}
