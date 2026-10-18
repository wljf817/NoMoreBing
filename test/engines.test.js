import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CUSTOM_ID,
  FALLBACK_ENGINE_ID,
  PLACEHOLDER_SEARCH_URL,
  PRESETS,
  SEARCH_RULE_ID,
  buildRules,
  defaultSetting,
  isValidTemplate,
  presetForSuggestUrl,
  resolveEngine,
  toManifestTemplate,
} from '../src/engines.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

// Mimics how declarativeNetRequest applies a regexSubstitution redirect.
function redirect(rule, url) {
  const regex = new RegExp(rule.condition.regexFilter);
  if (!regex.test(url)) return null;
  return url.replace(regex, rule.action.redirect.regexSubstitution.replace(/\\(\d)/g, '$$$1'));
}

const placeholder = (template, terms) => template.replace('{searchTerms}', terms);

test('every preset has a unique id and valid templates', () => {
  const ids = PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes(CUSTOM_ID));
  for (const p of PRESETS) {
    assert.ok(isValidTemplate(p.searchUrl), p.searchUrl);
    assert.ok(isValidTemplate(p.suggestUrl), p.suggestUrl);
  }
});

test('isValidTemplate accepts http(s) URLs with exactly one %s', () => {
  assert.ok(isValidTemplate('https://example.com/search?q=%s'));
  assert.ok(isValidTemplate('http://example.com/%s'));
  assert.ok(!isValidTemplate('https://example.com/search'));
  assert.ok(!isValidTemplate('https://example.com/?q=%s&r=%s'));
  assert.ok(!isValidTemplate('javascript:alert(%s)'));
  assert.ok(!isValidTemplate('ftp://example.com/?q=%s'));
  assert.ok(!isValidTemplate('https://example.com/\\1?q=%s'));
  assert.ok(!isValidTemplate('not a url %s'));
  assert.ok(!isValidTemplate(undefined));
});

test('resolveEngine falls back to the default preset', () => {
  const google = PRESETS.find((p) => p.id === 'google');
  assert.equal(resolveEngine(undefined).searchUrl, google.searchUrl);
  assert.equal(resolveEngine({ id: 'nope' }).searchUrl, google.searchUrl);
  assert.equal(resolveEngine({ id: CUSTOM_ID, searchUrl: 'bad' }).searchUrl, google.searchUrl);
});

test('the default engine follows the build suggestion provider', () => {
  for (const p of PRESETS) {
    assert.equal(presetForSuggestUrl(toManifestTemplate(p.suggestUrl)), p);
    assert.deepEqual(defaultSetting(toManifestTemplate(p.suggestUrl)), { id: p.id });
  }
  assert.equal(presetForSuggestUrl(undefined), null);
  assert.deepEqual(defaultSetting(undefined), { id: FALLBACK_ENGINE_ID });
  assert.deepEqual(defaultSetting('https://example.com/?q={searchTerms}'), { id: FALLBACK_ENGINE_ID });
});

test('resolveEngine keeps a valid custom engine', () => {
  const engine = resolveEngine({ id: CUSTOM_ID, searchUrl: 'https://example.com/?q=%s' });
  assert.deepEqual(engine, { searchUrl: 'https://example.com/?q=%s' });
});

test('search rule redirects placeholder searches to the engine', () => {
  const [rule] = buildRules(resolveEngine({ id: 'duckduckgo' }));
  assert.equal(rule.id, SEARCH_RULE_ID);
  assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
  assert.equal(
    redirect(rule, placeholder(PLACEHOLDER_SEARCH_URL, 'hello+%E4%B8%96%E7%95%8C')),
    'https://duckduckgo.com/?q=hello+%E4%B8%96%E7%95%8C',
  );
});

test('anything appended after the search terms is dropped', () => {
  const [rule] = buildRules(resolveEngine({ id: 'google' }));
  assert.equal(
    redirect(rule, `${placeholder(PLACEHOLDER_SEARCH_URL, 'cats')}&form=XYZ#top`),
    'https://www.google.com/search?q=cats',
  );
});

test('search rule ignores URLs other than the placeholder', () => {
  const [rule] = buildRules(resolveEngine({ id: 'google' }));
  assert.equal(redirect(rule, 'https://www.bing.com/search?q=cats'), null);
  assert.equal(redirect(rule, 'https://nomorebing.invalid.example.com/search?q=cats'), null);
});

test('only the search rule is built, since suggest requests bypass DNR', () => {
  const rules = buildRules(resolveEngine({ id: 'baidu' }));
  assert.deepEqual(rules.map((r) => r.id), [SEARCH_RULE_ID]);
});

test('manifest search provider uses the placeholder the rules redirect', () => {
  const manifest = readJson('../manifest.json');
  const provider = manifest.chrome_settings_overrides.search_provider;
  assert.equal(provider.search_url, PLACEHOLDER_SEARCH_URL);
  assert.equal(provider.is_default, true);
  const origin = new URL(PLACEHOLDER_SEARCH_URL.replace('{searchTerms}', 'x')).origin;
  assert.deepEqual(manifest.host_permissions, [`${origin}/*`]);
});

test('manifest suggest_url is one of the preset suggestion URLs', () => {
  const provider = readJson('../manifest.json').chrome_settings_overrides.search_provider;
  assert.ok(presetForSuggestUrl(provider.suggest_url), provider.suggest_url);
});

test('manifest search provider has the keys Chromium requires without prepopulated_id', () => {
  const provider = readJson('../manifest.json').chrome_settings_overrides.search_provider;
  for (const key of ['name', 'keyword', 'encoding', 'favicon_url', 'search_url']) {
    assert.ok(provider[key], key);
  }
  for (const key of ['search_url', 'suggest_url', 'favicon_url'].filter((k) => provider[k])) {
    const { protocol } = new URL(provider[key].replace('{searchTerms}', 'x'));
    assert.ok(protocol === 'https:' || protocol === 'http:', key);
  }
});

test('locales define the same keys, covering everything the options page uses', () => {
  const en = readJson('../_locales/en/messages.json');
  const zh = readJson('../_locales/zh_CN/messages.json');
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());

  const html = readFileSync(new URL('../src/options/options.html', import.meta.url), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) {
    assert.ok(key in en, key);
  }
});
