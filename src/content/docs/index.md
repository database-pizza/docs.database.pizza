---
title: database.pizza
description: A hosted database for small apps, agents, and scripts, with row, schema, and index history and scoped SQL-based restore.
---

database.pizza is a **hosted database for small apps, agents, and scripts**. Use SQLite-style SQL over HTTPS or MCP, inspect recorded row, schema, and index history, and select an earlier state for scoped SQL-based restore.

Every database runs on [PizzaSQL](/internals/architecture/), a SQL engine built from scratch in Go. PizzaSQL speaks **SQLite-inspired SQL** — it is *not* PostgreSQL and *not* a drop-in SQLite replacement. It exposes a **partially** PostgreSQL-compatible wire protocol, which lets some PostgreSQL clients connect, but the SQL dialect and server behavior remain SQLite-style. The [compatibility notes](/sql-reference/compatibility/) are the honest map of what works and what does not.

## Start with safety

- **Inspect history** — review recorded row, schema, and structural changes in [Change history](/history/change-history/).
- **Undo and recover** — roll back a mistake with scoped, reviewable SQL, and learn what recovery does *not* cover in [Undo & recovery](/history/undo-recovery/).

## Three ways in

- **New or returning?** Sign up at [app.database.pizza/start](https://app.database.pizza/start), then copy the agent instructions from your workspace. Copying creates a 6-hour setup MCP key and puts it in the prompt. Follow the [Quickstart](/getting-started/quickstart/) for a first query.
- **Writing SQL?** Start with [SQL at a glance](/sql-reference/overview/) and keep the [compatibility notes](/sql-reference/compatibility/) close before generating production queries.
- **Curious how it works?** The [Engine Internals](/internals/architecture/) section walks through the PizzaSQL architecture, query lifecycle, and storage model.

## What you get

Every database gives you a managed access surface plus a dashboard:

| Surface | Where | Best for |
| --- | --- | --- |
| MCP | `https://db.database.pizza/mcp` | Coding-agent tools with a short-lived workspace MCP key |
| PostgreSQL wire protocol (partial) | `db.database.pizza:5432` | `psql` and tested Postgres drivers |
| HTTP query API | `https://db.database.pizza/<org>/<db>/query` | Any language, serverless, and edge workloads |
| Auto-generated REST API (preview) | `https://db.database.pizza/<org>/<db>/api/<table>` | Single-table CRUD without writing SQL |
| Dashboard | `app.database.pizza` | Schema browsing, history, query editor, API keys, metrics |

All programmatic access is authenticated with **API keys**. Application keys carry granular scopes — `read`, `write`, `alter_table`, `drop_table` — so you can issue a read-only key to a reporting job and a write key to an ingestion service. MCP keys are workspace-scoped and expire: the copied setup prompt uses a 6-hour key. See [API keys & permissions](/clients/api-keys/).

> **Public-network connections:** prefer HTTPS or MCP. Source supports PostgreSQL proxy TLS, but the public endpoint declined TLS in a credential-free negotiation check on 2026-11-04. Do not send a key over public plaintext. A TLS-enabled deployment can use `sslmode=require` or `verify-full`; the engine hop stays plaintext loopback. The wire interface is partial, not general PostgreSQL/ORM compatibility. Read [Connect](/getting-started/connect/).

## A taste

Create a key in the dashboard, then query over HTTP:

```bash
curl -s https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer pz_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT 1 + 1 AS answer"}'
```

On a **TLS-enabled deployment**, with `psql` using the key as the password (fails closed if TLS is unavailable):

```bash
PGPASSWORD='pz_live_REPLACE_ME' psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=require"
```

Throughout these docs we use a fictional organization `acme` and database `production`, and the placeholder key `pz_live_REPLACE_ME`. Substitute your own values — and never paste a real key into anything you share.

## Getting started

- [Quickstart](/getting-started/quickstart/) — sign up, connect an agent, and run your first query.
- [Connect](/getting-started/connect/) — connection strings and parameters for every client.
- [Your first schema](/getting-started/first-schema/) — tables, inserts, indexes, and queries.

## History and recovery

- [Change history](/history/change-history/) — how row, schema, and structural history is recorded and inspected.
- [Undo & recovery](/history/undo-recovery/) — scoped undo, restore, and the limits of what recovery can (and can't) do.

## Use your database

- [PostgreSQL clients](/clients/postgresql/) — `psql` and driver configuration, with the compatibility caveats.
- [MCP for agents](/clients/mcp/) — client-specific setup, access boundaries, and key management.
- [HTTP query API](/clients/http-api/) — the managed JSON endpoint.
- [JavaScript](/clients/javascript/) and [Python](/clients/python/) — idiomatic examples.
- [REST API](/clients/rest-api/) — auto-generated CRUD endpoints.
- [API keys & permissions](/clients/api-keys/) — scopes, lifecycle, and security.

## Reference and guides

- [SQL reference](/sql-reference/overview/) — types, statements, expressions, functions, and constraints.
- [Import & export](/guides/import-export/) — move data in and out.
- [Errors & troubleshooting](/guides/errors/) — understand failure responses.
- [Limits & quotas](/guides/limits/) — what counts against your plan.

## The managed API vs. the engine

It's worth drawing one distinction early. PizzaSQL, the engine, exposes its own raw HTTP API (`POST /query`, `GET /schema/tables`, and so on) and its own PostgreSQL listener. Those are **internal** to the platform. As a customer you never touch them directly.

Instead, you talk to the **managed proxy** at `db.database.pizza`, which sits in front of your engine instance and adds authentication, per-organization routing (`<org>/<db>`), scope enforcement, quotas, and metrics. The endpoints look similar to the engine's, but they require a Bearer API key and a `<org>/<db>` path. The pages under [Use your database](#use-your-database) document the managed surface.

## Status

database.pizza is under active development. Features, quotas, and exact response shapes may change; anything unstable is flagged inline. If something here disagrees with what you observe, trust the observed behavior and [open an issue](https://github.com/database-pizza/app/issues).
