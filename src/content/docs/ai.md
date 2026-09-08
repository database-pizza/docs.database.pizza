---
title: Using these docs with AI
description: Feed database.pizza's documentation to AI tools via llms.txt, raw Markdown, and the copy-page action — and prompt it well.
---

These docs are built to be machine-readable as well as human-readable. If you're using an AI assistant, a coding agent, or a CLI tool that fetches context, this page explains how to give it accurate database.pizza knowledge.

## The files

### `/llms.txt`

A compact index of the entire documentation set, intended as a first stop for LLM tools. It contains:

- A one-line description of the docs.
- A list of every page as `[Title](https://docs.database.pizza/raw/<path>.md): description`, so a tool can see the shape of the site and fetch only the pages it needs.
- An "Important context" section summarizing the three facts that matter most to any generated SQL.

Give this to a tool when it needs an overview, then let it fetch specific pages by their `raw` URLs.

### `/llms-full.txt`

The full documentation corpus in a single file: every page's Markdown body, prefixed by its title and canonical URL, separated by `---`. Use it when a tool should hold the whole reference at once (for example, a long-context model doing schema or SQL generation).

### `/raw/…`

Every page is served as raw Markdown at a stable URL mirroring its path:

```text
/raw/index.md
/raw/getting-started/quickstart.md
/raw/clients/http-api.md
/raw/ai.md
```

These are the same sources behind the rendered pages, with frontmatter intact. Point a tool at a `raw` URL when you want exactly one page, uncluttered by navigation.

## The copy-page action

Each page has a **Copy page** button in its title area (next to a **View Markdown** link). Clicking it fetches the page's raw Markdown and copies it to your clipboard, ready to paste into a prompt or a tool's context window. It's the fastest way to hand a single page to an assistant without hunting for the `raw` URL.

## Prompt hygiene

The docs use a fictional organization `acme`, database `production`, and the placeholder key `pz_live_REPLACE_ME`. When you prompt an AI tool:

- **Never paste a real API key** into a prompt, source file, or log. Keys are secrets; substitute the placeholder and swap in the real value only in your actual runtime.
- **Give the tool the context it lacks.** An assistant doesn't know your org/db slugs, your schema, or your scopes. Provide them explicitly.
- **Point at the right page.** For SQL, cite the `raw` URL of the relevant reference page rather than paraphrasing from memory.
- **Ask for parameterized SQL.** Request `?` or `$1` placeholders instead of string-concatenated values.

## The PizzaSQL vs. PostgreSQL distinction

The single most important thing to tell a code-generating tool is this: **PizzaSQL is not PostgreSQL.** It speaks a PostgreSQL-compatible *wire protocol*, but its SQL is SQLite-compatible.

Key consequences:

- Use SQLite-style types and DDL: `INTEGER PRIMARY KEY`, `TEXT`, not `SERIAL` or `JSONB`.
- No schemas, roles, `ARRAY`, `ENUM`, or Postgres-only functions.
- Type handling follows SQLite affinity rules.

The canonical reference is the [Compatibility](/sql-reference/compatibility/) page. Include this line in your prompts before asking for SQL:

```text
PizzaSQL uses SQLite-style type affinity and exposes a PostgreSQL-compatible wire interface. It is not PostgreSQL itself. Prefer the compatibility page (https://docs.database.pizza/sql-reference/compatibility/) before generating production SQL.
```

## Example prompts

**Generate a schema:**

```text
Using https://docs.database.pizza/raw/getting-started/first-schema.md and
https://docs.database.pizza/raw/sql-reference/compatibility.md as context,
write a SQLite-compatible schema for my org/db `acme/production` with tables
`users` and `invoices`. Use INTEGER PRIMARY KEY, TEXT, and
`?` placeholders.
```

**Explain a concept:**

```text
Read https://docs.database.pizza/raw/engine/transactions.md and summarize how
transactions behave over the PostgreSQL protocol versus the HTTP API.
```

## Related

- [Compatibility](/sql-reference/compatibility/) — the dialect boundaries to keep in view.
- [Quickstart](/getting-started/quickstart/) — the values (`acme`, `production`, `pz_live_REPLACE_ME`) used throughout.
