# NoMoreBing

Stops Microsoft Edge from silently switching your address bar search engine back to Bing.

## How it works

NoMoreBing takes over Edge's address bar search engine through `chrome_settings_overrides`, so Edge's own resets can't change it. Searches go to a placeholder address and are redirected to the engine you pick: Google, DuckDuckGo, Baidu, Brave Search, Startpage, Ecosia, or a custom URL.

It only needs `declarativeNetRequest`, `storage`, and access to the placeholder domain. It doesn't read the pages you visit.

## Install

1. Download a zip from [Releases](https://github.com/wljf817/NoMoreBing/releases). The file name says where address bar suggestions come from (`none` means no suggestions).
2. Unzip it, open `edge://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the folder.
3. Keep the change when Edge asks, then pick a search engine.

## Development

```
npm test
npm run build -- <google|duckduckgo|baidu|brave|startpage|ecosia|none|all>
```

## License

[GPL-3.0](LICENSE)
