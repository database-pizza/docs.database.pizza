---
title: Quickstart
description: Create an organization, a database, and an API key, then run your first query over the PostgreSQL-compatible wire protocol or HTTP.
---

This guide gets you from a fresh account to a working query in about five minutes. It assumes you've signed up at `app.database.pizza`.

We'll use a fictional organization **acme** and a database **production**. Replace both with your own names throughout.

## 1. Create an organization

Organizations group your databases, members, and API keys. When you create one, its name becomes a **slug** — the URL-safe identifier used in every connection path.

1. Sign in to the dashboard.
2. Create an organization named `acme`.
3. The slug becomes `acme` (lowercased, spaces turned into `-`).

Your connection path always starts with the organization slug, then the database slug: `acme/production`.

## 2. Create a database

Inside the `acme` organization, create a database named `production`.

- The database name also becomes a slug: `production`.
- Each database has an isolated PizzaSQL namespace with its own schema and data.
- Databases are isolated from one another — a key for one can't touch another unless you grant it access.

## 3. Create an API key

Every programmatic connection authenticates with an API key, which doubles as your PostgreSQL password.

1. Open the `production` database and go to **API keys**.
2. Choose **Create API key** and give it a name like `local dev`.
3. Select the scopes you need. For now, enable **Read** and **Write** (and **Alter table** if you'll be creating tables from a client).
4. Copy the key immediately — it's shown only once.

A live key looks like `pz_live_…`. The docs use the placeholder `pz_live_REPLACE_ME`; substitute your real key.

> **Security**: Treat the key like a password. Don't commit it to source control, and prefer environment variables. See [API keys & permissions](/clients/api-keys/).

## 4. Run your first query

You have two equivalent options. Pick whichever fits your workflow.

### Over HTTP

```bash
curl -s https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer pz_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT 1 + 1 AS answer"}'
```

```json
{
  "columns": [{ "name": "answer", "type": "INTEGER" }],
  "rows": [[2]],
  "rowsReturned": 1,
  "executionTimeMicro": 108,
  "bytesRead": 4
}
```

The HTTP query API is documented in full at [HTTP query API](/clients/http-api/).

### Over PostgreSQL

```bash
PGPASSWORD='pz_live_REPLACE_ME' psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=disable" \
  -c "SELECT 1 + 1 AS answer;"
```

Three details matter here:

- The **database name is `acme/production`** — the slash is part of the name. In a connection URI it must be percent-encoded as `acme%2Fproduction`.
- **TLS is currently declined** by the proxy, so connect with `sslmode=disable`; your key and queries travel in cleartext over the wire.
- The wire protocol is **partially** PostgreSQL-compatible — `psql` works, but the SQL you send is SQLite-style, not PostgreSQL. See [PostgreSQL clients](/clients/postgresql/) and [Compatibility](/sql-reference/compatibility/).

Full details are in [Connect](/getting-started/connect/) and [PostgreSQL clients](/clients/postgresql/).

## 5. Create a table and query it

Now create a table and read it back:

```bash
curl -s https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer pz_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"sql": "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL)"}'
```

Then insert and select:

```bash
curl -s https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer pz_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"sql": "INSERT INTO users (name, email) VALUES (?, ?)", "params": ["Ada", "ada@acme.example"]}'
```

```bash
curl -s https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer pz_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM users"}'
```

Note the `?` placeholders with a `params` array — always pass values this way rather than concatenating them into the SQL string.

`INTEGER PRIMARY KEY` values are assigned automatically when omitted. PizzaSQL accepts `UNIQUE`, but does not currently enforce it; enforce email uniqueness in your application. See [Constraints](/sql-reference/constraints/) before relying on schema-level validation.

## Next steps

- [Change history](/history/change-history/) — see what your queries just changed.
- [Undo & recovery](/history/undo-recovery/) — revert a mistake before it matters.
- [Connect](/getting-started/connect/) — every connection parameter, in one place.
- [Your first schema](/getting-started/first-schema/) — a realistic schema with indexes.
- [SQL reference](/sql-reference/overview/) — the full dialect.
