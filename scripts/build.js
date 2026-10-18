// Builds installable packages, one per address bar suggestion provider.
// Edge fetches suggestions where extensions can't intercept them, so
// suggest_url can't follow the engine picked at runtime; instead the user
// picks a provider by installing the matching package.
//
//   npm run build -- <provider|none|all>
//
// Writes dist/<provider>/ (load it unpacked) and
// dist/nomorebing-<version>-<provider>.zip (for releases).

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { PRESETS, toManifestTemplate } from '../src/engines.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE_FILES = ['manifest.json', '_locales', 'src', 'icons', 'LICENSE'];
export const VARIANTS = [...PRESETS.map((p) => p.id), 'none'];

export function variantManifest(manifest, variant) {
  const copy = structuredClone(manifest);
  const provider = copy.chrome_settings_overrides.search_provider;
  if (variant === 'none') {
    delete provider.suggest_url;
    return copy;
  }
  const preset = PRESETS.find((p) => p.id === variant);
  if (!preset) throw new Error(`Unknown suggestion provider: ${variant}`);
  provider.suggest_url = toManifestTemplate(preset.suggestUrl);
  return copy;
}

function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split('\\').join('/'))
    .sort();
}

// Minimal zip writer (deflate, UTF-8 names). Timestamps are fixed to
// 1980-01-01 so the same input always produces the same zip.
export function zipDirectory(dir) {
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;
  const local = [];
  const central = [];
  let offset = 0;
  for (const name of listFiles(dir)) {
    const data = readFileSync(join(dir, name));
    const compressed = deflateRawSync(data, { level: 9 });
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += header.length + nameBytes.length + compressed.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

export function buildVariant(variant, outRoot = join(ROOT, 'dist')) {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const variantJson = variantManifest(manifest, variant);
  const dir = join(outRoot, variant);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const name of PACKAGE_FILES) {
    cpSync(join(ROOT, name), join(dir, name), {
      recursive: true,
      filter: (src) => !src.endsWith('.DS_Store'),
    });
  }
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(variantJson, null, 2)}\n`);
  const zip = join(outRoot, `nomorebing-${manifest.version}-${variant}.zip`);
  writeFileSync(zip, zipDirectory(dir));
  return { dir, zip };
}

function main([target]) {
  const variants = target === 'all' ? VARIANTS : [target];
  if (!variants.every((v) => VARIANTS.includes(v))) {
    console.error(`Usage: npm run build -- <${[...VARIANTS, 'all'].join('|')}>`);
    process.exit(1);
  }
  for (const variant of variants) {
    const { dir, zip } = buildVariant(variant);
    console.log(`${variant}: ${relative(ROOT, dir)}/  ${relative(ROOT, zip)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
