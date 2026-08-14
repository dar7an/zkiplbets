import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from '@swc/core';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../src');
const distRoot = join(srcRoot, '../dist');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const files = (await walk(srcRoot)).filter(
  (file) => extname(file) === '.ts' && !file.includes('/__tests__/') && !file.endsWith('.test.ts')
);
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const { code } = await transform(source, {
    filename: file,
    swcrc: true,
    sourceMaps: false,
  });
  const dest = join(distRoot, relative(srcRoot, file)).replace(/\.ts$/, '.js');
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, code);
}
console.log(`Compiled ${files.length} files to dist/`);
