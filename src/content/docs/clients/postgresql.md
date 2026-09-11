---
title: PostgreSQL clients
description: Connect to database.pizza with psql and tested PostgreSQL drivers — with the compatibility and TLS caveats you need to know.
---

PizzaSQL implements a **partial** PostgreSQL wire protocol, which lets *some* PostgreSQL clients connect — but not all, and not with full PostgreSQL behavior. Treat the protocol as a transport, not a promise of PostgreSQL semantics. The only clients worth relying on are the ones you have actually tested against your workload.

Before you connect anything, two facts matter:

- **The SQL is SQLite-style, not PostgreSQL.** The dialect differences in [Compatibility](/sql-reference/compatibility/) apply to every client.
- **TLS is not available.** The proxy currently declines SSL, so your API key and query traffic travel in cleartext over the wire. Use `sslmode=disable`, and do not send sensitive data over an untrusted network.

The connection parameters are described in [Connect](/getting-started/connect/):

- Host `db.database.pizza`, port `5432`.
- Database name `acme/production` (slash included).
- Password is your API key; the user field is ignored.
- `sslmode=disable` — TLS is currently declined by the proxy.

## Connection URI

```text
postgresql://u:pz_live_REPLACE_ME@db.database.pizza:5432/acme%2Fproduction?sslmode=disable
```

Use this everywhere a client accepts a URI. The `/` in the database name is percent-encoded as `%2F`.

## Command-line tools

```bash
# Interactive
PGPASSWORD='pz_live_REPLACE_ME' psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=disable"

# Single command
PGPASSWORD='pz_live_REPLACE_ME' psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=disable" \
  -c "SELECT * FROM users LIMIT 5;"

# Run a script
PGPASSWORD='pz_live_REPLACE_ME' psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=disable" \
  -f schema.sql
```

`pgcli` works the same way:

```bash
pgcli "postgresql://u:pz_live_REPLACE_ME@db.database.pizza:5432/acme%2Fproduction?sslmode=disable"
```

## GUIs

Some GUI tools connect using the connection type **PostgreSQL**, but support varies and is not guaranteed. DBeaver, DataGrip, TablePlus, and pgAdmin have been reported to work in basic use:

- **Host**: `db.database.pizza`
- **Port**: `5432`
- **Database**: `acme/production`
- **User**: `u` (any value)
- **Password**: your API key
- **SSL**: off / disable

Most GUIs use discrete fields, so enter `acme/production` literally — no `%2F` encoding needed. A GUI that runs introspection beyond the [emulated catalog subset](/internals/postgres-protocol/) may fail; test it against your actual schema before relying on it.

## Drivers

### Node.js — `pg`

```javascript
import { Client } from 'pg';

const client = new Client({
  host: 'db.database.pizza',
  port: 5432,
  user: 'u',
  password: process.env.PZ_API_KEY,
  database: 'acme/production', // discrete field, no encoding
  ssl: false,
});

await client.connect();
const res = await client.query('SELECT * FROM users WHERE id = $1', [1]);
console.log(res.rows);
await client.end();
```

See [JavaScript](/clients/javascript/) for a fuller walkthrough.

### Python — `psycopg`

```python
import os
import psycopg

conn = psycopg.connect(
    host="db.database.pizza",
    port=5432,
    user="u",
    password=os.environ["PZ_API_KEY"],
    dbname="acme/production",
    sslmode="disable",
)
cur = conn.cursor()
cur.execute("SELECT * FROM users WHERE id = %s", (1,))
print(cur.fetchall())
conn.close()
```

See [Python](/clients/python/) for more.

### Go — `pgx` / `lib/pq`

```go
import (
    "github.com/jackc/pgx/v5"
)

conn, err := pgx.Connect(ctx,
    "postgresql://u:pz_live_REPLACE_ME@db.database.pizza:5432/acme%2Fproduction?sslmode=disable")
```

pgx decodes the type metadata advertised for single-table direct column selects: `BIGINT` arrives as `int64` and `DATETIME`/`TIMESTAMP` columns arrive as `time.Time` (UTC, via `timestamptz`). Expressions and joins still report `TEXT`. An experimental Gogs fork uses a `pgx`-backed `database/sql` driver against a local PizzaSQL source build only — it is not a deployed configuration (see [Compatibility](/sql-reference/compatibility/)).

## Placeholders

PizzaSQL accepts both `?` (SQLite style) and `$1`, `$2` (PostgreSQL style) placeholders. Prefer the style your driver parameterizes natively — most Postgres drivers use `$1`, `$2`.

```sql
-- PostgreSQL style
SELECT * FROM invoices WHERE user_id = $1 AND status = $2;

-- SQLite style
SELECT * FROM invoices WHERE user_id = ? AND status = ?;
```

## Dialect notes

The SQL you send is **SQLite-compatible**, not PostgreSQL. That means:

- `INTEGER PRIMARY KEY`, not `SERIAL`; values are assigned when omitted.
- `TEXT`, not `VARCHAR(n)` with enforced length.
- No schemas, roles, `ARRAY`, `JSONB`, or `ENUM` types.
- No `RETURNING`-heavy Postgres-specific features; check [Compatibility](/sql-reference/compatibility/) first.

The [SQL reference](/sql-reference/overview/) is the source of truth for what's supported.

## Transactions

The PostgreSQL protocol forwards `BEGIN`, `COMMIT`, `ROLLBACK`, and `SAVEPOINT` to the engine, so you can use multi-statement DML transactions over the wire. This is **not** the full PostgreSQL transactional surface: transactions here are optimistic DML transactions (see [Transactions](/engine/transactions/)), and DDL inside a transaction is not rolled back. The HTTP API rejects transaction statements outright.
