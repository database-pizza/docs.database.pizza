---
title: Quickstart
description: Create or choose a hosted database, configure a private key, and verify a first write and read over MCP or HTTPS.
---

PizzaSQL is database.pizza's own SQL engine, with a SQLite-inspired dialect. It is not a drop-in SQLite or PostgreSQL replacement. Start with a small, non-critical workload and review [Compatibility](/sql-reference/compatibility/) before generating a schema.

## 1. Create or choose a database

Open [app.database.pizza/start](https://app.database.pizza/start) and sign in.

- A new account gets a workspace, a starter database named `app`, and a scoped key.
- An existing account chooses an organization and database. **Connect agent** creates a new key only when you explicitly request one.
- To inspect the handoff without provisioning anything, open [the preview](https://app.database.pizza/start?preview=1).

You can also create organizations and databases manually in the console. Every connection belongs to an organization and database; the examples below use the fictional path `acme/production`. Substitute the path shown in your own handoff.

## 2. Save a private key

The full key is shown **once**. Save it in a local secret manager or environment; never paste it into an agent conversation, commit it, or put it in public browser code.

For the following examples, set `PZ_API_KEY` privately in your shell. In Bash:

```bash
read -rsp 'database.pizza key: ' PZ_API_KEY; export PZ_API_KEY; printf '\n'
```

New starter keys allow `read`, `write`, and `alter_table`, not `drop_table`. **Connect agent** also offers read-only keys. Build permissions still allow row deletion and schema/index changes. Existing keys can be revoked in **Connect agent** or **API keys**; lost keys cannot be displayed again.

## 3. Connect an agent, or use HTTPS

### With an agent

Choose your client in **Connect agent**, configure it locally, then copy the credential-free first prompt. [MCP for agents](/clients/mcp/) has client-specific instructions for Claude Code, Cursor, and VS Code.

### With a script

Run one statement over HTTPS:

```bash
curl --fail-with-body https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer $PZ_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT 1 + 1 AS answer"}'
```

The result includes `columns` and `rows`; the answer row is `[2]`. Authentication and SQL errors are failures, not successful setup. See the [HTTP query API](/clients/http-api/) for the response fields.

## 4. Write and read a note

Only run the following in an empty example database. Inspect existing tables before changing an existing project.

```bash
curl --fail-with-body https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer $PZ_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"sql":"CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT, body TEXT)"}'
```

```bash
curl --fail-with-body https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer $PZ_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"sql":"INSERT INTO notes (title, body) VALUES (?, ?)","params":["Welcome","My first stored note"]}'
```

```bash
curl --fail-with-body https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer $PZ_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT id, title, body FROM notes"}'
```

`INTEGER PRIMARY KEY` assigns an ID when omitted. Always bind values with `params` rather than concatenating user input into SQL. HTTP and MCP accept one statement per call and reject transaction statements.

Current source builds enforce `UNIQUE` constraints and unique indexes; duplicates return SQLSTATE `23505`. Inline constraints are materialized when a table is created, so an old table whose declarations were discarded does not gain enforcement just because its engine is upgraded. Check the running engine and [Constraints](/sql-reference/constraints/); do not rely on the old blanket claim that uniqueness is unsupported.

## 5. Inspect what changed

Open your database's **Data** view and your organization's **History** view. Inspect a record's versions, schema changes, and index operations. The data history view can select an earlier journal position and restore a row or table with SQL you review. See [Change history](/history/change-history/) and [Undo & recovery](/history/undo-recovery/) for the retention and restore boundaries.

## What about PostgreSQL clients?

PizzaSQL has a **partial PostgreSQL wire interface**, not PostgreSQL SQL semantics. The managed proxy supports TLS in source, but deployment configuration determines whether it is offered. On 2026-11-04, a credential-free SSL negotiation check of the public endpoint returned `N` (TLS not offered).

Use HTTPS or MCP for public-network access while the proxy does not offer TLS. Do not work around it by sending a key over public plaintext. For a TLS-enabled deployment, start with `sslmode=require` (or `verify-full` with a trusted hostname-matching certificate). See [Connect](/getting-started/connect/) and [PostgreSQL clients](/clients/postgresql/).

## Next steps

- [Your first schema](/getting-started/first-schema/) — a larger example and schema boundaries.
- [API keys & permissions](/clients/api-keys/) — restrict and rotate access.
- [Limits & quotas](/guides/limits/) — the default beta quotas and how to inspect your actual quota.
- [Import & export](/guides/import-export/) — keep an independent copy of important data.
