import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const docsDir = path.join(root, 'src/content/docs');
const rawDir = path.join(root, 'public/raw');
const publicDir = path.join(root, 'public');

async function collectMarkdown(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectMarkdown(entryPath)));
    if (entry.isFile() && entry.name.endsWith('.md')) files.push(entryPath);
  }

  return files.sort();
}

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { body: source, description: '', title: '' };

  const value = (key) => {
    const line = match[1].match(new RegExp(`^${key}:\\s*["']?(.*?)["']?\\s*$`, 'm'));
    return line?.[1] ?? '';
  };

  return {
    body: source.slice(match[0].length),
    description: value('description'),
    title: value('title'),
  };
}

await rm(rawDir, { recursive: true, force: true });
await mkdir(rawDir, { recursive: true });

const files = await collectMarkdown(docsDir);
const pages = [];

for (const file of files) {
  const relative = path.relative(docsDir, file);
  const route = relative === 'index.md' ? '/' : `/${relative.replace(/(?:\/index)?\.md$/, '/')}`;
  const source = await readFile(file, 'utf8');
  const { body, description, title } = parseFrontmatter(source);
  const rawPath = path.join(rawDir, relative);

  await mkdir(path.dirname(rawPath), { recursive: true });
  await writeFile(rawPath, source);
  pages.push({ body, description, route, source, title });
}

const index = [
  '# database.pizza',
  '',
  '> End-user documentation for database.pizza, PizzaSQL, and its PostgreSQL and HTTP interfaces.',
  '',
  'Use the canonical Markdown links below when supplying context to an AI tool. The full documentation corpus is available at https://docs.database.pizza/llms-full.txt.',
  '',
  '## Documentation',
  '',
  ...pages.map(({ description, route, title }) => `- [${title || route}](https://docs.database.pizza/raw${route === '/' ? '/index.md' : `${route.slice(0, -1)}.md`})${description ? `: ${description}` : ''}`),
  '',
  '## Important context',
  '',
  '- PizzaSQL uses SQLite-style type affinity and exposes a PostgreSQL-compatible wire interface. It is not PostgreSQL itself.',
  '- Prefer the compatibility page before generating production SQL.',
  '- Never place a real API key in prompts, source code, or logs.',
  '',
].join('\n');

const full = pages
  .map(({ body, route, title }) => `# ${title}\n\nCanonical URL: https://docs.database.pizza${route}\n\n${body.trim()}\n`)
  .join('\n---\n\n');

await mkdir(publicDir, { recursive: true });
await writeFile(path.join(publicDir, 'llms.txt'), index);
await writeFile(path.join(publicDir, 'llms-full.txt'), full);
