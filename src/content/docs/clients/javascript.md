---
title: JavaScript
description: Query database.pizza from Node.js and the browser using pg or fetch.
---

You have two ways to reach your database from JavaScript: the **PostgreSQL wire protocol** via the `pg` driver, or the **HTTP query API** via `fetch`. Choose based on where your code runs and whether you need transactions.

Set your key in the environment before starting:

```bash
export PZ_API_KEY='pz_live_REPLACE_ME'
```

## With `pg` (Node.js)

The `pg` driver (node-postgres) gives you a real connection pool and transaction support. The database name includes the `/`, and TLS is disabled.

```bash
npm install pg
```

```javascript
import { Client } from 'pg';

const client = new Client({
  host: 'db.database.pizza',
  port: 5432,
  user: 'u',                       // ignored; any value
  password: process.env.PZ_API_KEY,
  database: 'acme/production',     // discrete field — no %2F encoding
  ssl: false,                      // TLS is declined by the proxy
});

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL,
    email TEXT UNIQUE
  )
`);

await client.query(
  'INSERT INTO users (name, email) VALUES ($1, $2)',
  ['Ada Lovelace', 'ada@acme.example'],
);

const res = await client.query(
  'SELECT * FROM users WHERE name = $1',
  ['Ada Lovelace'],
);
console.log(res.rows);
// [{ id: 1, name: 'Ada Lovelace', email: 'ada@acme.example' }]

await client.end();
```

Use `$1, $2` placeholders with `pg`; never interpolate values into the SQL string.

### Connection pool

For a long-running server, use a `Pool` instead of a single `Client`:

```javascript
import { Pool } from 'pg';

const pool = new Pool({
  host: 'db.database.pizza',
  port: 5432,
  user: 'u',
  password: process.env.PZ_API_KEY,
  database: 'acme/production',
  ssl: false,
  max: 10,
});

const { rows } = await pool.query('SELECT COUNT(*) AS n FROM users');
```

## With `fetch` (any runtime)

The HTTP API needs no driver, so it works in the browser, in edge functions, and in serverless runtimes. It does not support transactions.

```javascript
const KEY = process.env.PZ_API_KEY; // or import.meta.env for Vite/browser

async function query(sql, params = []) {
  const res = await fetch(
    'https://db.database.pizza/acme/production/query',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    },
  );

  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(`query failed (${res.status}): ${error}`);
  }

  return res.json();
}

const result = await query(
  'SELECT * FROM invoices WHERE status = ?',
  ['open'],
);
console.log(result.columns); // [{ name: 'id', type: 'INTEGER' }, …]
console.log(result.rows);    // [[1, 1, 4500, 'open', '…'], …]
```

Use `?` placeholders with the HTTP `params` array. `$1` placeholders are supported by PostgreSQL drivers, not by the HTTP parameter substitution path.

## A browser caveat

It is technically possible to call the HTTP API from a browser, but that means shipping your API key to end users. **Don't embed a live key in client-side code.** Route browser requests through your own backend, which holds the key server-side. Use a tightly scoped key (for example `read`-only, or a `REST_API` key with per-table limits) as a defense in depth. See [API keys & permissions](/clients/api-keys/).

## ORMs

Because the wire protocol is only partially PostgreSQL-compatible, ORMs and migration tools are **not guaranteed** to work and are not currently verified end to end. An ORM that issues PostgreSQL-specific introspection or SQL will fail. If you need one, keep its SQL and DDL to the SQLite-compatible subset, expect to adjust migrations away from Postgres-specific types (`SERIAL`, `TEXT[]`, `JSONB`), and **test your exact ORM and migration path before deploying** — see [Compatibility](/sql-reference/compatibility/) and [PostgreSQL protocol](/internals/postgres-protocol/).

## Next

- [Python](/clients/python/) — the same two surfaces in Python.
- [REST API](/clients/rest-api/) — CRUD without SQL.
- [HTTP query API](/clients/http-api/) — full endpoint reference.
