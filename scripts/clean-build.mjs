import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist-nas');
if (relative(root, output) !== 'dist-nas') throw new Error('Unexpected build output directory');
if (existsSync(output)) {
  const archives = resolve(root, 'work');
  const archive = resolve(archives, 'build-' + Date.now());
  if (dirname(archive) !== archives) throw new Error('Unexpected build archive');
  mkdirSync(archives, { recursive: true });
  renameSync(output, archive);
}
