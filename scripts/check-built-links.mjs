import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : entry.name.endsWith('.html') ? [file] : [];
  }));
  return nested.flat();
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

const missing = new Set();
const pages = await htmlFiles(root);
for (const file of pages) {
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(/(?:href|data-raw-path)="(\/[^"#]*)[^"]*"/g)) {
    if (match[1].startsWith('//')) continue;
    const pathname = new URL(match[1], 'https://docs.database.pizza').pathname;
    const target = path.join(root, decodeURIComponent(pathname));
    if (!(await exists(target)) && !(await exists(path.join(target, 'index.html')))) {
      missing.add(`${path.relative(root, file)} -> ${pathname}`);
    }
  }
}
if (missing.size) {
  throw new Error(`Missing built link targets:\n${[...missing].join('\n')}`);
}
console.log(`Verified internal and raw-Markdown link targets across ${pages.length} built pages.`);
