---
title: Your first schema
description: Design and create a realistic schema with tables, constraints, and indexes, then query it.
---

This page walks through building a small schema on the `acme/production` database from [Connect](/getting-started/connect/). It assumes you have an API key with `read`, `write`, and `alter_table` scopes.

Throughout, remember the key dialect rule: **PizzaSQL uses SQLite-compatible SQL, not PostgreSQL.** Use `INTEGER PRIMARY KEY` instead of `SERIAL`, and `TEXT` instead of `VARCHAR(n)`. Full details live in [SQL reference](/sql-reference/overview/) and [Compatibility](/sql-reference/compatibility/).

## The model

We'll track users and their invoices:

- `users` — one row per customer.
- `invoices` — one row per invoice, referencing a user.

## Create the tables

```sql
CREATE TABLE users (
  id         INTEGER PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL
);

CREATE TABLE invoices (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  issued_at   TEXT NOT NULL
);

CREATE INDEX idx_invoices_user ON invoices(user_id);
```

A few things to notice:

- `INTEGER PRIMARY KEY` gives each row an auto-assigned integer `id` when you omit it.
- Dynamic defaults are evaluated when the table is created, not for each row. Supply timestamps in the insert with `datetime('now')` instead.
- The index on `invoices(user_id)` keeps the per-user join fast. See [Indexes](/engine/indexes/).
- PizzaSQL does not currently enforce `UNIQUE` or foreign keys. Check those invariants in your application. See [Constraints](/sql-reference/constraints/).

Run these over HTTP, one statement at a time, or paste them all into a single `/execute` batch. Over the PostgreSQL wire protocol you can send the whole block directly:

```bash
PGPASSWORD='pz_live_REPLACE_ME' psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=disable" \
  -f schema.sql
```

## Insert rows

Values are passed with `?` placeholders (SQLite style) or `$1`, `$2` (PostgreSQL style). Both are accepted; use whichever your driver prefers.

```sql
INSERT INTO users (email, name, plan, created_at) VALUES
  ('ada@acme.example',  'Ada Lovelace', 'pro',  datetime('now')),
  ('grace@acme.example', 'Grace Hopper', 'pro',  datetime('now')),
  ('alan@acme.example',  'Alan Turing',  'free', datetime('now'));

INSERT INTO invoices (user_id, amount_cents, status, issued_at) VALUES
  (1, 12000, 'paid', datetime('now')),
  (1, 4500,  'open', datetime('now')),
  (2, 9900,  'open', datetime('now'));
```

## Query it

```sql
SELECT
  u.name,
  COUNT(i.id)                 AS invoice_count,
  COALESCE(SUM(i.amount_cents), 0) AS total_cents
FROM users u
LEFT JOIN invoices i ON i.user_id = u.id
GROUP BY u.id
ORDER BY total_cents DESC;
```

```text
      name       | invoice_count | total_cents
-----------------+---------------+-------------
 Ada Lovelace    |             2 |       16500
 Grace Hopper    |             1 |        9900
 Alan Turing     |             0 |           0
```

Joins, aggregation, `GROUP BY`, `ORDER BY`, and `COALESCE` are all part of the dialect — see [Statements](/sql-reference/statements/), [Expressions & operators](/sql-reference/expressions/), and [Functions](/sql-reference/functions/).

## Evolve the schema

Add a column to track a per-user region:

```sql
ALTER TABLE users ADD COLUMN region TEXT NOT NULL DEFAULT 'us';
```

PizzaSQL supports `ADD COLUMN`, `DROP COLUMN`, and `RENAME COLUMN` on `ALTER TABLE`. Schema-changing statements require the `alter_table` scope (or `drop_table` for `DROP TABLE`).

## Verify it all

List your tables and inspect a table's shape over HTTP:

```bash
curl -s https://db.database.pizza/acme/production/schema/tables \
  -H "Authorization: Bearer pz_live_REPLACE_ME"
```

```bash
curl -s https://db.database.pizza/acme/production/schema/tables/users \
  -H "Authorization: Bearer pz_live_REPLACE_ME"
```

The dashboard's **Schema** tab shows the same information visually.

## Next steps

- [PostgreSQL clients](/clients/postgresql/) and [JavaScript](/clients/javascript/) / [Python](/clients/python/) — run this schema from your app.
- [REST API](/clients/rest-api/) — expose the `users` table as CRUD endpoints without SQL.
- [Import & export](/guides/import-export/) — bring in an existing SQLite file.
