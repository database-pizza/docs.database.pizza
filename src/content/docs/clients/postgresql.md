---
title: PostgreSQL clients
description: Configure tested PostgreSQL drivers for PizzaSQL's partial wire interface, with TLS and SQL compatibility boundaries.
---

PizzaSQL speaks a **partial PostgreSQL wire protocol**, not PostgreSQL SQL semantics. Test the exact driver, version, introspection, and workload you intend to use. Use SQLite-inspired SQL and the [Compatibility](/sql-reference/compatibility/) guide.

## TLS: capability versus deployment

The managed proxy implements TLS in source. `PGPROXY_TLS_MODE=optional` offers TLS when a certificate is installed; `required` rejects plaintext startup with `08P01`; `off` disables TLS. The proxy-to-engine loopback hop remains plaintext.

**Workspaces created after the TLS cutover require TLS.** A plaintext connection to one is rejected with `08P01` before the proxy asks for the password, so the API key never crosses the network. Workspaces created earlier still accept plaintext during the transition and show a console banner; move them to `sslmode=require` when you can.

Whether a deployment currently offers TLS is deployment state. If `sslmode=require` fails with an SSL negotiation error, no certificate is installed yet; do not fall back to public plaintext. See [Connect](/getting-started/connect/).

The examples below require a TLS-enabled deployment and deliberately fail rather than send credentials over public plaintext. Use `sslmode=verify-full` with a trusted hostname-matching certificate where supported. `sslmode=require` demands encryption but is not a substitute for explicit hostname verification. Use `sslmode=disable` only on a deliberately trusted local or tunneled hop, never as a public-network fallback.

## Parameters and URI

- Host: `db.database.pizza`; port: `5432`.
- Database: `acme/production`, including the slash.
- User: ignored (`u` is conventional).
- Password: your database-scoped API key, configured privately.

A URI must percent-encode the slash:

```text
postgresql://u:pz_live_REPLACE_ME@db.database.pizza:5432/acme%2Fproduction?sslmode=require
```

Discrete driver or GUI fields use `acme/production` literally.

## Command-line tools

With `PZ_API_KEY` configured in your local environment:

```bash
PGPASSWORD="$PZ_API_KEY" psql \
  'postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=require' \
  -c 'SELECT 1 AS ready'
```

Use `-f schema.sql` instead of `-c` for a script. `pgcli` accepts the same URI. Do not put a real key into a shared command or prompt.

## Node.js — pg

```javascript
import { Client } from 'pg';

const client = new Client({
  host: 'db.database.pizza',
  port: 5432,
  user: 'u',
  password: process.env.PZ_API_KEY,
  database: 'acme/production',
  ssl: true, // TLS plus certificate verification; requires a TLS-enabled proxy
});

await client.connect();
const result = await client.query('SELECT * FROM users WHERE id = $1', [1]);
console.log(result.rows);
await client.end();
```

node-postgres defaults to `ssl: false`; set it explicitly for a protected connection. Provide an appropriate CA for a private trust chain rather than disabling certificate validation. [JavaScript](/clients/javascript/) also documents the HTTPS alternative.

## Python — psycopg

```python
import os
import psycopg

with psycopg.connect(
    host="db.database.pizza",
    port=5432,
    user="u",
    password=os.environ["PZ_API_KEY"],
    dbname="acme/production",
    sslmode="verify-full",
) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM users WHERE id = %s", (1,))
        print(cur.fetchall())
```

Use a trusted certificate for `verify-full`. [Python](/clients/python/) has an HTTPS script path that does not depend on PostgreSQL TLS configuration.

## Go — pgx / lib/pq

Both accept PostgreSQL-style connection strings. Configure the password from your local secret environment rather than embedding it in source. For example, with pgx:

```go
cfg, err := pgx.ParseConfig("postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=verify-full")
if err != nil {
    return err
}
cfg.Password = os.Getenv("PZ_API_KEY")
conn, err := pgx.ConnectConfig(ctx, cfg)
```

This fragment assumes imports for `os` and `github.com/jackc/pgx/v5`, a context, and normal error/connection cleanup in the caller.

Current source advertises `BIGINT` and `DATETIME`/`TIMESTAMP` metadata for supported direct projections; expressions and joins can report `TEXT`. Verify decoding against your tenant's running engine.

## GUIs and ORMs

Select PostgreSQL as the connection transport and enter the parameters above, requiring TLS and a trusted certificate. Introspection beyond the emulated catalog subset can fail. Neither a PostgreSQL driver nor a SQLite-inspired dialect establishes universal ORM compatibility. Test your complete migration and query path before relying on it.

## SQL and parameters

Use the placeholders your driver binds natively: `$1`, `$2` for `pg`/pgx and `%s` for psycopg. HTTP examples use `?` with a `params` array.

- `INTEGER PRIMARY KEY`, not `SERIAL`.
- `TEXT`, not a length-enforced `VARCHAR(n)`.
- No PostgreSQL schemas, roles, `ARRAY`, `JSONB`, or `ENUM` types.
- `UNIQUE` and unique indexes are enforced in current source builds; duplicates are `23505`. Older tables may need explicit index creation. See [Constraints](/sql-reference/constraints/).
- `CHECK` is supported (enforced with `23514`; deterministic single-row expressions only). Foreign keys are supported and enforced with `23503` (parent must be PK/unique; `CASCADE`/`SET NULL`/`SET DEFAULT` supported, `DEFERRABLE` rejected). Unsupported non-constant defaults are rejected with `0A000`.
- `ANY`/`ALL` array predicates are rejected with `0A000`; use a bound scalar `IN` list instead.

## Transactions, discovery, and quotas

The wire interface supports optimistic DML `BEGIN`/`COMMIT`/`ROLLBACK` and savepoints. DDL is non-transactional. This is not PostgreSQL MVCC or row locking; read [Transactions](/engine/transactions/). HTTP and MCP reject transaction statements.

Discover the engine using `pizzasql_version()` or the `pizzasql.version` startup parameter. The generic `server_version` is a protocol-compatibility string, not your engine build. The console's engine information exposes version/capability documents.

A full organization connection quota returns `53300` with a retry hint. Bound client pools, release idle connections appropriately, and use retry/backoff. See [Limits & quotas](/guides/limits/).
