import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRESETS, presetForSuggestUrl } from '../src/engines.js';
import { VARIANTS, buildVariant, variantManifest } from '../scripts/build.js';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const suggestUrlOf = (m) => m.chrome_settings_overrides.search_provider.suggest_url;

test('there is one variant per preset plus none', () => {
  assert.deepEqual(VARIANTS, [...PRESETS.map((p) => p.id), 'none']);
});

test('each preset variant points suggest_url at that preset', () => {
  for (const preset of PRESETS) {
    assert.equal(presetForSuggestUrl(suggestUrlOf(variantManifest(manifest, preset.id))), preset);
  }
});

test('the none variant has no suggest_url and leaves the source manifest alone', () => {
  const before = JSON.stringify(manifest);
  assert.equal(suggestUrlOf(variantManifest(manifest, 'none')), undefined);
  assert.equal(JSON.stringify(manifest), before);
});

test('unknown variants are rejected', () => {
  assert.throws(() => variantManifest(manifest, 'bing'), /Unknown suggestion provider/);
});

test('buildVariant writes a loadable directory and a zip of it', () => {
  const out = mkdtempSync(join(tmpdir(), 'nomorebing-build-'));
  try {
    const { dir, zip } = buildVariant('duckduckgo', out);
    const built = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    assert.equal(presetForSuggestUrl(suggestUrlOf(built)).id, 'duckduckgo');
    for (const file of ['src/background.js', '_locales/zh_CN/messages.json', 'icons/icon128.png', 'LICENSE']) {
      assert.ok(existsSync(join(dir, file)), file);
    }
    for (const file of ['test', 'scripts', 'package.json', 'README.md']) {
      assert.ok(!existsSync(join(dir, file)), file);
    }

    const bytes = readFileSync(zip);
    assert.equal(bytes.readUInt32LE(0), 0x04034b50);
    const end = bytes.subarray(bytes.length - 22);
    assert.equal(end.readUInt32LE(0), 0x06054b50);
    assert.ok(end.readUInt16LE(10) >= 10);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
