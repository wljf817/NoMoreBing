import { defaultSetting } from './engines.js';

// The engine choice lives in storage.sync so it follows the user's Edge profile.
const KEY = 'engine';

// suggest_url is fixed per build (see scripts/build.js); undefined when the
// build has no suggestions.
export function manifestSuggestUrl() {
  return chrome.runtime.getManifest().chrome_settings_overrides?.search_provider?.suggest_url;
}

export async function getEngineSetting() {
  const { [KEY]: setting } = await chrome.storage.sync.get(KEY);
  return setting ?? defaultSetting(manifestSuggestUrl());
}

export async function setEngineSetting(setting) {
  await chrome.storage.sync.set({ [KEY]: setting });
}

export function onEngineSettingChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && KEY in changes) callback();
  });
}
