---
title: PostgreSQL protocol
description: How PizzaSQL implements the PostgreSQL wire protocol — what's supported, what's emulated, and how the managed proxy layers auth and routing on top.
---

PizzaSQL implements a **partial** PostgreSQL wire protocol (v3.0) so that *some* PostgreSQL clients — `psql`, and basic use of `node-postgres` — can connect. Compatibility with other drivers, ORMs, and GUI tools is **not** guaranteed and is largely unverified. This page covers the engine's protocol implementation, and then the managed database.pizza proxy that sits in front of it.

## Engine protocol support

### Startup and auth

- Accepts the standard startup message and negotiates the protocol version.
- **TLS is optional**: an SSLRequest is answered with `S` when the proxy has a certificate and the rest of the session runs over TLS; otherwise it is answered with `N` (decline) and the client retries without SSL. `PGPROXY_REQUIRE_TLS` rejects plaintext startup with `08P01`.
- Authentication is `AuthenticationOk` (no password required) at the engine level.
- The server advertises these parameter statuses:
  - `server_version` = `14.0 (PizzaSQL)` (so drivers requiring PG 9.x+ are satisfied)
  - `server_encoding`, `client_encoding` = `UTF8`
  - `DateStyle` = `ISO, MDY`
  - `TimeZone` = `UTC`
  - `pizzasql.version` / `pizzasql.commit` identify the actual engine build
  - `pizzasql.proxy_errors` = `1` on builds supporting ordered managed-proxy scope errors

### Query protocol

- **Simple query** (`Q`): a single statement or a semicolon-separated batch. The batch is parsed fully before execution.
- **Extended query** (`Parse`/`Bind`/`Describe`/`Execute`/`Sync`/`Close`): prepared statements and portals are supported for the driver conversation, but there is no server-side statement cache or plan — parameters are bound by rewriting the query text client-side in the engine (`$1`, `$2`, … are substituted as literals before parsing). `Parse` accepts exactly one command. Binding recognizes placeholders only outside quoted strings/identifiers and line/block comments.
- `Bind` supports text-format parameters for all types and binary-format parameters for booleans (16), `int2` (21), `int4` (23), `int8` (20), `float4` (700), `float8` (701), `numeric` (1700), `jsonb` (3802), and one-dimensional arrays of int2/int4/int8/bool/float4/float8/text/varchar/numeric. Other binary types fail with `0A000`; malformed binary input fails with `22P02`. Result formats may be requested per column: an empty list means text, a single entry applies to every column, and otherwise the list must match the column count (`08P01`). Binary results are supported for booleans, int2/int4/int8, float4/float8, text/varchar, bytea, jsonb, and one-dimensional arrays of the supported element types; requesting binary for any other reported OID fails with `0A000`. Because `Describe` returns `NoData` rather than a `RowDescription`, the format list is validated at `Execute`; for `INSERT`/`UPDATE`/`DELETE ... RETURNING` the statement has already run when an invalid format or OID is rejected (no rows are sent and no rollback is attempted). A stored value that cannot be represented in the reported type fails encoding with `22P02`.
- `Describe(Statement)` returns a `ParameterDescription` with inferred OIDs: explicit casts, comparison and assignment targets, `INSERT`/`UPDATE`/`ON CONFLICT` columns, `ANY`/`ALL` element types, and `jsonb`. Client-supplied non-zero OIDs win; unresolved parameters are reported as `TEXT` (25), never `0`. Parameter numbers above 65,535 fail `Parse` with `54000` before any allocation.
- Portal execution is single-use (a portal may be executed once, then must be re-bound). Execute must request the unbounded row limit (`maxRows = 0`); bounded/resumable portals are not implemented and fail with `0A000` before any side effect.
- `Describe` never executes SQL. Statement Describe returns `ParameterDescription` followed by `NoData`; portal Describe returns `NoData`. `Execute` still sends the real `RowDescription` and rows. Returning `NoData` is a compatibility shim for clients that always send Describe; it is not full PostgreSQL row metadata during Describe.

### Command completion and errors

- Completion tags: `INSERT 0 n`, `UPDATE n`, `DELETE n`, `SELECT n`, `CREATE TABLE`, `ALTER TABLE`, etc.
- Errors carry a severity (`ERROR`/`FATAL`), an SQLSTATE code (a subset: `42601` syntax error, `08P01` protocol violation, `0A000` feature not supported, `25P02` transaction aborted, `XX000` internal, `42P07` duplicate table, `42703` undefined column, …), and a message.
- Transaction status is tracked in `ReadyForQuery`: idle (`I`), in transaction block (`T`), failed (`E`). An ERROR, including an ordinary syntax error, fails an open transaction. In a failed block, only `ROLLBACK` (or `ROLLBACK TO SAVEPOINT`) is accepted; everything else returns `25P02`.
- A failed extended cycle discards subsequent messages until `Sync`; `Flush` and `Terminate` remain usable. `Sync` reports the engine's actual transaction state.

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

Result columns are advertised with a small OID mapping: `INTEGER`/`INT` → `int4` (23), `BIGINT` → `int8` (20), `SMALLINT`/`TINYINT`/`MEDIUMINT` and integer `CAST` results → `int8` (20) because the engine carries int64 values without range enforcement, `NUMERIC`/`DECIMAL` → `float8` (701) because they are stored as float64, `TEXT`/`VARCHAR`/`CHAR`/`UUID` → `text` (25), `REAL`/`FLOAT` → `float4` (700), `DOUBLE` → `float8` (701), `BOOLEAN` → `bool` (16), `BLOB` → `bytea` (17), `DATETIME`/`TIMESTAMP` → `timestamptz` (1184), `DATE` → `date` (1082), anything else → `text`. Values are sent in text format; datetime values are exchanged as UTC RFC3339 so `timestamptz` decodes directly.

Type metadata is derived from schema and expression analysis, never from row values, so it holds for empty results. Direct projections (a column reference, an alias, `*`, or `table.*`) use the declared type. Expressions are inferred: comparisons and boolean operators → `bool` (16), `COUNT` → `int8` (20), `SUM`/`AVG` → `int8` or `float8`, `MIN`/`MAX` → the argument type, string literals → `text`, integer literals → `int4`/`int8` by width, decimal literals → `float8`, and `CAST` → the target type after the carrier rules above. A `UUID` column is stored as text and reports `text` (25), not the native PostgreSQL `uuid` OID. The advertised OID is a decoding hint, not a strict type: storage remains SQLite-style dynamic affinity, `INTEGER` can hold values outside int32, and `NUMERIC` is not exact.

### Protocol hardening

Message frames are size-capped (`16 MiB` for normal messages, `1 MiB` for startup) to bound memory against malformed clients.

## The managed PostgreSQL proxy

On database.pizza, customers do **not** reach the engine directly. A proxy listens at `db.database.pizza:5432` and adds authentication and routing:

1. The client connects, optionally negotiates TLS, and the proxy requests a **cleartext password** (API key).
2. The password is your **API key**. The proxy verifies it, checks it belongs to the organization and (if scoped) the database.
3. The database name in the connection string must be **`org/db`** (e.g. `acme/production`). In a connection URI the slash must be percent-encoded: `acme%2Fproduction`.
4. On success, the proxy opens a TCP tunnel to the engine's PostgreSQL port with the resolved internal **namespace**, and forwards protocol frames in both directions.

While forwarding, the proxy:

- **Enforces API-key scopes** on every simple query and prepared statement (`read`, `write`, `alter_table`, `drop_table`). Updated proxies replace denied Query/Parse frames with an ordered engine error relay when the engine advertises `pizzasql.proxy_errors=1`. The denied SQL is never executed; the engine returns `42501` (`insufficient_privilege`) and owns transaction failure and Sync recovery. On older engines, the updated proxy returns FATAL `42501` and disconnects instead of synthesizing an incorrect idle state. Reconnect after that fallback; uncommitted work is rolled back.
- **Tracks queries** for metrics and quota billing by correlating client executions with backend completion frames.
- **Forwards transactions** unchanged, so `BEGIN`/`COMMIT`/`ROLLBACK` work over the proxy (unlike the managed HTTP endpoint, which rejects them).
- **Closes both tunnel directions** when either peer disconnects or forwarding fails, releasing the connection slot even without a client `Terminate`. Healthy established sessions have no proxy idle deadline, including idle LISTEN subscribers.

The relay is a negotiated private extension between the updated proxy and engine;
ordinary clients do not send it. Deploying the app does not upgrade tenant
engines, so recoverable scope errors require both sides to support the relay.

Practical connection string (using the key as the password):

```bash
PGPASSWORD='pz_live_REPLACE_ME' psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=disable"
```

## What this means for you

- **TLS terminates at the proxy, when enabled.** With a certificate installed, `sslmode=require` protects the client-to-proxy hop. Without one, SSL negotiation is declined and the API key travels in cleartext; use that only over a trusted hop. The proxy-to-engine loopback hop is plaintext in both cases. The HTTP API is HTTPS-only.
- Your PostgreSQL *password* is the API key; the user is ignored.
- The database name is `org/db`, not a bare name.
- Only the catalog tables listed above are available to tools for introspection; anything deeper fails.
- SQL dialect is SQLite, not PostgreSQL — the protocol is a transport, not a promise of PostgreSQL semantics (see [Compatibility](/sql-reference/compatibility/)).
