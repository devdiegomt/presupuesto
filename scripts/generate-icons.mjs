import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sourceDir = resolve(here, '..', 'assets', 'icons');
const outDir = resolve(here, '..', 'public', 'icons');

async function render(src, out, size) {
  const svg = await readFile(resolve(sourceDir, src));
  const buf = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(resolve(outDir, out), buf);
  console.log(`  ${out}  ${buf.length.toLocaleString()} bytes`);
}

console.log('Generating PWA icons from', sourceDir, '→', outDir);
await render('source.svg', 'icon-192.png', 192);
await render('source.svg', 'icon-512.png', 512);
await render('source-maskable.svg', 'icon-512-maskable.png', 512);
console.log('Done.');
