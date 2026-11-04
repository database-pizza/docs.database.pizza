---
title: Quickstart
description: Create or choose a hosted database, configure a private key, and verify a first write and read over MCP or HTTPS.
---

PizzaSQL is database.pizza's own SQL engine, with a SQLite-inspired dialect. It is not a drop-in SQLite or PostgreSQL replacement, but it supports a good chunk of SQLite; for many small projects, switching the connection is the main change. Start with a small, non-critical workload and review [Compatibility](/sql-reference/compatibility/) before generating a schema.

## 1. Sign up and copy the agent instructions

Open [app.database.pizza/start](https://app.database.pizza/start) and continue with
Google or GitHub. Your default workspace is created automatically; no database
or API key is created just by signing in.

The workspace empty state says *Paste these instructions into your current
project, or use them to start a new one.* Copying creates a **6-hour setup-only
MCP key** and places it in a short prompt for your coding agent. The prompt
contains the MCP URL, the Bearer header, and the first steps. Treat that prompt
as a secret; manage keys under **Workspace → MCP**.

You can also create databases manually in the console. Every programmatic
connection for app code belongs to one organization and one database; the
examples below use the fictional path `acme/production`.

## 2. For application code, get a separate private key

MCP keys are for agent operations and expire. App code should use a separate,
database-scoped key created under **API keys**.

The full key is shown **once**. Save it in a local secret manager or environment;
never paste it into an agent conversation, commit it, or put it in public browser
code.

For the following examples, set `PZ_API_KEY` privately in your shell. In Bash:

```bash
read -rsp 'database.pizza key: ' PZ_API_KEY; export PZ_API_KEY; printf '\n'
```

Default app keys can grant `read`, `write`, and `alter_table`; `drop_table` is a
separate choice. Build permissions still allow row deletion and schema/index
changes. Revoke keys you no longer need in **API keys**; lost keys cannot be
displayed again.

## 3. Connect an agent, or use HTTPS

### With an agent

Paste the workspace instructions into your coding agent. The prompt includes the
MCP URL and a 6-hour setup key; the agent configures its own client. See
[MCP for agents](/clients/mcp/) for key management and limits.

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

Open your database's **Data** view and your organization's **History** view. Inspect a record's versions, schema changes, and index operations. The data history view can select an earlier journal position and restore a row or table with SQL you review.

An approved agent can also call `get_history` through MCP, with bounded
pagination. Restore with reviewed SQL; treating raw index-maintenance records as
a restore API is not supported. See [Change history](/history/change-history/)
and [Undo & recovery](/history/undo-recovery/) for retention and restore
boundaries.

## What about PostgreSQL clients?

PizzaSQL has a **partial PostgreSQL wire interface**, not PostgreSQL SQL semantics. The managed proxy supports TLS in source, but deployment configuration determines whether it is offered. On 2026-11-04, a credential-free SSL negotiation check of the public endpoint returned `N` (TLS not offered).

Use HTTPS or MCP for public-network access while the proxy does not offer TLS. Do not work around it by sending a key over public plaintext. For a TLS-enabled deployment, start with `sslmode=require` (or `verify-full` with a trusted hostname-matching certificate). See [Connect](/getting-started/connect/) and [PostgreSQL clients](/clients/postgresql/).

## Next steps

- [Your first schema](/getting-started/first-schema/) — a larger example and schema boundaries.
- [API keys & permissions](/clients/api-keys/) — restrict and rotate access.
- [Limits & quotas](/guides/limits/) — the default beta quotas and how to inspect your actual quota.
- [Import & export](/guides/import-export/) — keep an independent copy of important data.
