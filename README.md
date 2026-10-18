# NoMoreBing

A Microsoft Edge extension that keeps Edge from silently switching your address bar search engine back to Bing.

## How it works

Edge has no extension API for reading or changing the default search engine. The one supported route is `chrome_settings_overrides`, which lets an extension provide the default search engine while it is enabled. NoMoreBing uses it like this:

1. The manifest makes `https://nomorebing.invalid/search?q={searchTerms}` the default search engine. `.invalid` is a reserved domain that never resolves.
2. When you pick an engine on the options page, a `declarativeNetRequest` rule redirects that placeholder to the engine you chose. Suggestions work the same way through a second placeholder.
3. The redirect happens before the request leaves the browser, so your query only goes to the engine you picked. If a rule is ever missing, the request goes nowhere instead of falling back to another engine.

While the extension is enabled, Edge's search settings show the search engine as controlled by NoMoreBing. To hand control back to Edge, turn off or remove the extension.

The only permissions are `declarativeNetRequest`, `storage`, and host access to `nomorebing.invalid`. The extension does not read the pages you visit.

## Search engines

- Google
- DuckDuckGo
- Baidu
- Brave Search
- Startpage
- Ecosia
- Custom: any `http(s)` URL with `%s` where the search terms go, plus an optional suggestion URL

Your choice is saved in `storage.sync`, so it follows your Edge profile.

## Scope

NoMoreBing only covers the address bar default search engine. It does not change the search box on the new tab page, sidebar search, Copilot, or links that Windows opens in Edge.

## Install from source

1. Clone this repository.
2. Open `edge://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Keep the change when Edge asks about the new search settings, then pick an engine on the options page that opens.

## Development

There is no build step. The extension is plain JavaScript modules loaded straight from `src/`.

```
manifest.json          MV3 manifest, including the search provider override
_locales/              English and Simplified Chinese strings
src/engines.js         Engine presets and redirect rule builder (no browser APIs)
src/settings.js        Reads and writes the engine choice in storage.sync
src/background.js      Service worker that keeps the redirect rules in sync
src/options/           Options page
test/                  Unit tests for the pure logic
```

Run the tests with Node.js 20 or later:

```
npm test
```

## License

[GPL-3.0](LICENSE)
