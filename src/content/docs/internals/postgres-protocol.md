---
title: PostgreSQL protocol
description: How PizzaSQL implements the PostgreSQL wire protocol — what's supported, what's emulated, and how the managed proxy layers auth and routing on top.
---

PizzaSQL implements a **partial** PostgreSQL wire protocol (v3.0) so that *some* PostgreSQL clients — `psql`, and basic use of `node-postgres` — can connect. Compatibility with other drivers, ORMs, and GUI tools is **not** guaranteed and is largely unverified. This page covers the engine's protocol implementation, and then the managed database.pizza proxy that sits in front of it.

## Engine protocol support

### Startup and auth

- Accepts the standard startup message and negotiates the protocol version.
- **SSL is not supported**: an SSLRequest is answered with `N` (decline), after which the client should retry without SSL.
- Authentication is `AuthenticationOk` (no password required) at the engine level.
- The server advertises these parameter statuses:
  - `server_version` = `14.0 (PizzaSQL)` (so drivers requiring PG 9.x+ are satisfied)
  - `server_encoding`, `client_encoding` = `UTF8`
  - `DateStyle` = `ISO, MDY`
  - `TimeZone` = `UTC`

### Query protocol

- **Simple query** (`Q`): a single statement or a semicolon-separated batch. The batch is parsed fully before execution.
- **Extended query** (`Parse`/`Bind`/`Describe`/`Execute`/`Sync`/`Close`): prepared statements and portals are supported for the driver conversation, but there is no server-side statement cache or plan — parameters are bound by rewriting the query text client-side in the engine (`$1`, `$2`, … are substituted as literals before parsing).
- `Bind` supports text-format parameters for all types and binary-format parameters for booleans (OID 16), `int2` (21), `int4` (23), and `int8` (20); other binary types are rejected.
- Parameter OIDs are mapped to a small set: `0` (infer), `16` boolean, `20`/`21`/`23` integers, `26`/`700`/`701`/`1700` numerics; anything else is treated as text.
- Portal execution is single-use (a portal may be executed once, then must be re-bound).

### Command completion and errors

- Completion tags: `INSERT 0 n`, `UPDATE n`, `DELETE n`, `SELECT n`, `CREATE TABLE`, `ALTER TABLE`, etc.
- Errors carry a severity (`ERROR`/`FATAL`), an SQLSTATE code (a subset: `42601` syntax error, `08P01` protocol violation, `0A000` feature not supported, `25P02` transaction aborted, `XX000` internal, `42P07` duplicate table, `42703` undefined column, …), and a message.
- Transaction status is tracked in `ReadyForQuery`: idle (`I`), in transaction block (`T`), failed (`E`). In a failed block, only `ROLLBACK` (or `ROLLBACK TO SAVEPOINT`) is accepted; everything else returns `25P02`.

### Catalog emulation

Many drivers run introspection queries on connect. PizzaSQL intercepts and emulates a small subset so tools don't fail:

- `SELECT version()` → `PostgreSQL 14.0 (PizzaSQL)`
- `SELECT current_user` → the connection's `user` parameter
- `SHOW server_version` / `server_encoding` / `client_encoding`
- `SELECT ... FROM information_schema.tables / columns / table_constraints / key_column_usage`
- `SELECT ... FROM pg_tables / pg_indexes`
- `SELECT ... FROM sqlite_master` / `sqlite_schema` — read-only synthesized rows for SQLite migrators
- `PRAGMA index_list` / `index_info` / `table_xinfo` — answered from the durable schema

These are generated from the PizzaSQL schema, not a real PostgreSQL or SQLite catalog. Filtering (`WHERE table_name = 'x'`, `WHERE schemaname = ...`) is recognized for simple equality patterns; other clauses (joins, subqueries against catalog tables) are not supported. The catalog is a **read-only compatibility shim**, not a queryable schema.

### Type mapping on results

Result columns are advertised with a small OID mapping: `INTEGER`/`INT` → `int4` (23), `BIGINT` → `int8` (20), `TEXT`/`VARCHAR`/`CHAR`/`UUID` → `text` (25), `REAL`/`FLOAT` → `float4` (700), `DOUBLE` → `float8` (701), `BOOLEAN` → `bool` (16), `BLOB` → `bytea` (17), `DATETIME`/`TIMESTAMP` → `timestamptz` (1184), anything else → `text`. Values are sent in text format; datetime values are exchanged as UTC RFC3339 so `timestamptz` decodes directly.

Type metadata is populated only for **single-table direct column projections** (a column reference, an alias, or `SELECT *`), derived from schema metadata rather than row values so it holds even for empty results. Expressions, joins, multi-table queries, and unknown columns still report `TEXT` (25). A `UUID` column is stored as text and reports `text` (25), not the native PostgreSQL `uuid` OID. The advertised OID reflects the **declared** column type (`INTEGER` stays `int4`, for example) and only guides client decoding — it does not make values strictly typed: storage remains SQLite-style dynamic affinity.

### Protocol hardening

Message frames are size-capped (`16 MiB` for normal messages, `1 MiB` for startup) to bound memory against malformed clients.

## The managed PostgreSQL proxy

On database.pizza, customers do **not** reach the engine directly. A proxy listens at `db.database.pizza:5432` and adds authentication and routing:

1. The client connects and the proxy declines SSL, then requests a **cleartext password**.
2. The password is your **API key**. The proxy verifies it, checks it belongs to the organization and (if scoped) the database.
3. The database name in the connection string must be **`org/db`** (e.g. `acme/production`). In a connection URI the slash must be percent-encoded: `acme%2Fproduction`.
4. On success, the proxy opens a TCP tunnel to the engine's PostgreSQL port with the resolved internal **namespace**, and forwards protocol frames in both directions.

While forwarding, the proxy:

- **Enforces API-key scopes** on every simple query and prepared statement (`read`, `write`, `alter_table`, `drop_table`). A statement the key isn't allowed to run is rejected with `insufficient_privilege`.
- **Tracks queries** for metrics and quota billing by correlating client executions with backend completion frames.
- **Forwards transactions** unchanged, so `BEGIN`/`COMMIT`/`ROLLBACK` work over the proxy (unlike the HTTP endpoint, which rejects them).

Practical connection string (using the key as the password):

```bash
PGPASSWORD='pz_live_REPLACE_ME' psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=disable"
```

## What this means for you

- **TLS is not available.** The proxy declines SSL, so connections use `sslmode=disable` (or your client's equivalent) and your API key and query traffic travel in cleartext. Do not use the wire protocol for sensitive data over an untrusted network; the HTTP API is HTTPS-only.
- Your PostgreSQL *password* is the API key; the user is ignored.
- The database name is `org/db`, not a bare name.
- Only the catalog tables listed above are available to tools for introspection; anything deeper fails.
- SQL dialect is SQLite, not PostgreSQL — the protocol is a transport, not a promise of PostgreSQL semantics (see [Compatibility](/sql-reference/compatibility/)).
