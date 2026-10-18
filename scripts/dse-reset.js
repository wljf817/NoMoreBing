// Test helper for Edge's default search engine (DSE) reset.
//
// Chromium signs `default_search_provider_data` with an HMAC. On Windows and
// macOS, a value that no longer matches its signature is deleted at startup,
// so the default falls back to the built-in one (Bing in Edge).
//
//   check  <user-data-dir> [profile]  Read-only: current DSE and reset markers.
//   tamper <user-data-dir> [profile]  Edit the DSE value so Edge resets it on
//                                     the next launch. Throwaway profiles only.
//
// Typical run on macOS:
//   open -na "Microsoft Edge" --args --user-data-dir="$HOME/edge-dse-test"
//   (pick a non-Bing engine in edge://settings/searchEngines, then quit Edge)
//   npm run dse-reset -- tamper "$HOME/edge-dse-test"
//   (launch the same command again and see which engine the address bar uses)

import { copyFileSync, existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const DSE_PATH = ['default_search_provider_data', 'template_url_data'];
const PREF_FILES = ['Secure Preferences', 'Preferences'];

const REAL_PROFILE_DIRS = [
  ...['', ' Beta', ' Dev', ' Canary'].map((channel) =>
    join(homedir(), 'Library', 'Application Support', `Microsoft Edge${channel}`),
  ),
  join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Microsoft', 'Edge'),
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

const get = (obj, path) => path.reduce((node, key) => node?.[key], obj);

// SingletonLock is a symlink to "hostname-pid" that doesn't resolve, so
// existsSync (which follows links) would miss it.
function linkExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

// Chromium stores times as microseconds since 1601-01-01, as a string.
function chromeTime(value) {
  if (!value) return null;
  const ms = Number(BigInt(value) / 1000n - 11644473600000n);
  return new Date(ms).toISOString();
}

function loadPrefFiles(profileDir) {
  return PREF_FILES.map((name) => join(profileDir, name))
    .filter((file) => existsSync(file))
    .map((file) => ({ file, json: JSON.parse(readFileSync(file, 'utf8')) }));
}

function check(profileDir) {
  const files = loadPrefFiles(profileDir);
  if (files.length === 0) fail(`No preference files in ${profileDir}`);
  for (const { file, json } of files) {
    const dse = get(json, DSE_PATH);
    console.log(`${file}`);
    console.log(`  default search engine: ${dse ? `${dse.short_name} (${dse.keyword})` : '(not stored here)'}`);
    console.log(`  prefs.preference_reset_time: ${chromeTime(get(json, ['prefs', 'preference_reset_time'])) ?? '(none)'}`);
    console.log(`  prefs.tracked_preferences_reset: ${JSON.stringify(get(json, ['prefs', 'tracked_preferences_reset']) ?? [])}`);
  }
}

function tamper(userDataDir, profileDir) {
  if (REAL_PROFILE_DIRS.some((dir) => userDataDir.toLowerCase().startsWith(dir.toLowerCase()))) {
    fail('Refusing to tamper with a real Edge profile. Use a throwaway --user-data-dir.');
  }
  if (['SingletonLock', 'lockfile'].some((name) => linkExists(join(userDataDir, name)))) {
    fail('Edge is still using this profile. Quit it completely first.');
  }
  const target = loadPrefFiles(profileDir).find(({ json }) => get(json, DSE_PATH));
  if (!target) {
    fail('No stored default search engine. Pick a non-Bing engine in edge://settings/searchEngines, quit Edge, and retry.');
  }
  const dse = get(target.json, DSE_PATH);
  const before = dse.short_name;
  dse.short_name = `${before} (tampered)`;
  copyFileSync(target.file, `${target.file}.bak`);
  writeFileSync(target.file, JSON.stringify(target.json));
  console.log(`Changed short_name "${before}" -> "${dse.short_name}" in ${target.file}`);
  console.log(`Backup: ${target.file}.bak`);
  console.log('Launch Edge with the same --user-data-dir; it should reset the default search engine.');
}

const [command, dirArg, profile = 'Default'] = process.argv.slice(2);
if (!['check', 'tamper'].includes(command) || !dirArg) {
  fail('Usage: node scripts/dse-reset.js <check|tamper> <user-data-dir> [profile]');
}
const userDataDir = resolve(dirArg);
const profileDir = join(userDataDir, profile);
if (command === 'check') check(profileDir);
else tamper(userDataDir, profileDir);
