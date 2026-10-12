#!/usr/bin/env node
// Builds the store uploads: dist/chrome-<version>.zip (Chrome Web Store) and dist/edge-<version>.zip (Microsoft
// Edge Add-ons), the same files under the same version, containing only what the extension runs: manifest, pages,
// css, js, fonts and icons.
// A "key" in manifest.json (used to give the unpacked copy the store's ID) is left out:
// the store sets the ID itself and rejects uploads that carry one.
//
//   node tools/package.mjs
//
// No dependencies: a small ZIP writer on top of Node's zlib.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const INCLUDE = ['manifest.json', 'app.html', 'popup.html', 'css', 'js', 'fonts', 'icons'];
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
if (manifest.description.length > 132) throw new Error(`manifest description is ${manifest.description.length} characters; the store allows 132`);

const files = [];
const walk = (rel) => {
  const abs = path.join(ROOT, rel);
  if (fs.statSync(abs).isDirectory()) for (const name of fs.readdirSync(abs).sort()) walk(path.join(rel, name));
  else files.push(rel.split(path.sep).join('/'));
};
INCLUDE.forEach(walk);

const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

const parts = [];
const central = [];
let offset = 0;
const dosTime = 0, dosDate = (2026 - 1980) << 9 | 10 << 5 | 9; // fixed timestamp keeps the ZIP reproducible
for (const name of files) {
  let data = fs.readFileSync(path.join(ROOT, name));
  if (name === 'manifest.json' && 'key' in manifest) { const { key, ...rest } = manifest; data = Buffer.from(JSON.stringify(rest, null, 2) + '\n'); }
  const packed = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = packed.length < data.length;
  const body = useDeflate ? packed : data;
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
  parts.push(local, nameBuf, body);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(useDeflate ? 8 : 0, 10);
  cd.writeUInt16LE(dosTime, 12); cd.writeUInt16LE(dosDate, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42);
  central.push(cd, nameBuf);
  offset += local.length + nameBuf.length + body.length;
}
const cdBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);

const zip = Buffer.concat([...parts, cdBuf, end]);
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
for (const store of ['chrome', 'edge']) {
  const out = path.join(ROOT, 'dist', `${store}-${manifest.version}.zip`);
  fs.writeFileSync(out, zip);
  console.log(`wrote ${path.relative(ROOT, out)}: ${files.length} files, ${(zip.length / 1024).toFixed(0)} KB`);
}
