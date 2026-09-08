# database.pizza docs

External documentation for database.pizza and the PizzaSQL engine, built with [Astro Starlight](https://starlight.astro.build/).

## Development

```bash
npm install
npm run dev
```

`npm run build` generates the static site in `dist/`. Before Astro runs, `scripts/generate-ai.mjs` also creates:

- `/llms.txt`: compact documentation index for AI tools.
- `/llms-full.txt`: full documentation corpus.
- `/raw/*.md`: canonical Markdown for every rendered page.

## Verification

```bash
npm run check
npm run build
```

The public site is configured for `https://docs.database.pizza`.
