import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CUSTOM_ID,
  PLACEHOLDER_SEARCH_URL,
  PLACEHOLDER_SUGGEST_URL,
  PRESETS,
  SEARCH_RULE_ID,
  SUGGEST_RULE_ID,
  buildRules,
  isValidTemplate,
  resolveEngine,
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

test('resolveEngine keeps a valid custom engine and drops an invalid suggest URL', () => {
  const engine = resolveEngine({
    id: CUSTOM_ID,
    searchUrl: 'https://example.com/?q=%s',
    suggestUrl: 'oops',
  });
  assert.deepEqual(engine, { searchUrl: 'https://example.com/?q=%s', suggestUrl: null });
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

test('suggest rule redirects only when the engine has a suggest URL', () => {
  const rules = buildRules(resolveEngine({ id: 'baidu' }));
  const suggest = rules.find((r) => r.id === SUGGEST_RULE_ID);
  assert.equal(
    redirect(suggest, placeholder(PLACEHOLDER_SUGGEST_URL, 'abc')),
    'https://suggestion.baidu.com/su?action=opensearch&ie=utf-8&wd=abc',
  );

  const withoutSuggest = buildRules({ searchUrl: 'https://example.com/?q=%s', suggestUrl: null });
  assert.deepEqual(withoutSuggest.map((r) => r.id), [SEARCH_RULE_ID]);
});

test('manifest search provider uses the same placeholders as the rules', () => {
  const manifest = readJson('../manifest.json');
  const provider = manifest.chrome_settings_overrides.search_provider;
  assert.equal(provider.search_url, PLACEHOLDER_SEARCH_URL);
  assert.equal(provider.suggest_url, PLACEHOLDER_SUGGEST_URL);
  assert.equal(provider.is_default, true);
  for (const url of [PLACEHOLDER_SEARCH_URL, PLACEHOLDER_SUGGEST_URL]) {
    const origin = new URL(url.replace('{searchTerms}', 'x')).origin;
    assert.ok(manifest.host_permissions.includes(`${origin}/*`), origin);
  }
});

test('manifest search provider has the keys Chromium requires without prepopulated_id', () => {
  const provider = readJson('../manifest.json').chrome_settings_overrides.search_provider;
  for (const key of ['name', 'keyword', 'encoding', 'favicon_url', 'search_url']) {
    assert.ok(provider[key], key);
  }
  for (const key of ['search_url', 'suggest_url', 'favicon_url']) {
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
