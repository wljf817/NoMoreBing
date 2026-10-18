// Pure engine logic: no chrome.* APIs here, so it can be unit-tested in Node.

// Must match chrome_settings_overrides.search_provider in manifest.json.
// `.invalid` never resolves, so if a redirect rule is missing the query goes nowhere.
export const PLACEHOLDER_SEARCH_URL = 'https://nomorebing.invalid/search?q={searchTerms}';
export const PLACEHOLDER_SUGGEST_URL = 'https://nomorebing.invalid/suggest?q={searchTerms}';

export const SEARCH_RULE_ID = 1;
export const SUGGEST_RULE_ID = 2;
export const RULE_IDS = [SEARCH_RULE_ID, SUGGEST_RULE_ID];

export const PRESETS = [
  {
    id: 'google',
    name: 'Google',
    searchUrl: 'https://www.google.com/search?q=%s',
    suggestUrl: 'https://www.google.com/complete/search?client=chrome&q=%s',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    searchUrl: 'https://duckduckgo.com/?q=%s',
    suggestUrl: 'https://duckduckgo.com/ac/?type=list&q=%s',
  },
  {
    id: 'baidu',
    name: 'Baidu',
    searchUrl: 'https://www.baidu.com/s?ie=utf-8&wd=%s',
    suggestUrl: 'https://suggestion.baidu.com/su?action=opensearch&ie=utf-8&wd=%s',
  },
  {
    id: 'brave',
    name: 'Brave Search',
    searchUrl: 'https://search.brave.com/search?q=%s',
    suggestUrl: 'https://search.brave.com/api/suggest?q=%s',
  },
  {
    id: 'startpage',
    name: 'Startpage',
    searchUrl: 'https://www.startpage.com/sp/search?query=%s',
    suggestUrl: 'https://www.startpage.com/osuggestions?q=%s',
  },
  {
    id: 'ecosia',
    name: 'Ecosia',
    searchUrl: 'https://www.ecosia.org/search?q=%s',
    suggestUrl: 'https://ac.ecosia.org/autocomplete?type=list&q=%s',
  },
];

export const CUSTOM_ID = 'custom';
export const DEFAULT_SETTING = { id: 'google' };

// A template is an http(s) URL containing `%s` exactly once. Backslashes are
// rejected because they are special in DNR regexSubstitution.
export function isValidTemplate(template) {
  if (typeof template !== 'string') return false;
  if (template.split('%s').length !== 2) return false;
  if (template.includes('\\')) return false;
  try {
    const url = new URL(template.replace('%s', 'test'));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

// Turns a stored setting into { searchUrl, suggestUrl }, falling back to the
// default preset when the setting is unknown or invalid.
export function resolveEngine(setting) {
  if (setting?.id === CUSTOM_ID && isValidTemplate(setting.searchUrl)) {
    return {
      searchUrl: setting.searchUrl,
      suggestUrl: isValidTemplate(setting.suggestUrl) ? setting.suggestUrl : null,
    };
  }
  const preset =
    PRESETS.find((p) => p.id === setting?.id) ??
    PRESETS.find((p) => p.id === DEFAULT_SETTING.id);
  return { searchUrl: preset.searchUrl, suggestUrl: preset.suggestUrl };
}

// Regex that captures the already-encoded search terms from a placeholder URL.
// It matches the whole URL because regexSubstitution only replaces the matched
// part; anything Edge appends after the terms is dropped instead of leaking
// into the engine URL.
export function placeholderRegex(placeholderUrl) {
  const [prefix] = placeholderUrl.split('{searchTerms}');
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^${escaped}([^&#]*).*$`;
}

// Builds the declarativeNetRequest dynamic rules for an engine. Without a
// suggestion URL no suggest rule is added, so suggestion requests stay on the
// unresolvable placeholder and fail quietly.
export function buildRules({ searchUrl, suggestUrl }) {
  const rules = [
    {
      id: SEARCH_RULE_ID,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: searchUrl.replace('%s', '\\1') },
      },
      condition: {
        regexFilter: placeholderRegex(PLACEHOLDER_SEARCH_URL),
        resourceTypes: ['main_frame'],
      },
    },
  ];
  if (suggestUrl) {
    rules.push({
      id: SUGGEST_RULE_ID,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: suggestUrl.replace('%s', '\\1') },
      },
      condition: {
        regexFilter: placeholderRegex(PLACEHOLDER_SUGGEST_URL),
        resourceTypes: ['xmlhttprequest', 'other'],
      },
    });
  }
  return rules;
}
