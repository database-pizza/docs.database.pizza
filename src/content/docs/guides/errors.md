---
title: Errors & troubleshooting
description: Understand the error responses from the HTTP, REST, and PostgreSQL surfaces, and how to fix them.
---

Errors arrive through each transport's native shape. This page catalogs the common cases across the HTTP query API, REST API, and PostgreSQL protocol.

## Error shape

### HTTP and REST

Errors return JSON with an `error` string and a non-2xx status:

```json
{ "error": "permission denied: operation DROP TABLE requires scope 'drop_table' which is not granted to this API key" }
```

### PostgreSQL protocol

The proxy surfaces errors as standard PostgreSQL `ErrorResponse` frames, so your client shows them like any database error:

```text
FATAL:  invalid_password
        authentication failed
```

## HTTP / REST status codes

| Status | Meaning | Typical fix |
| --- | --- | --- |
| `400` | Malformed JSON request body | Check the JSON and `Content-Type` header |
| `401` | Missing or invalid API key | Verify the key, its prefix, and that it isn't revoked or expired |
| `403` | Key lacks a required scope, or doesn't have access to this database | Check scopes in the dashboard; grant the missing one |
| `404` | Organization, database, table, or row not found | Confirm the `org/db` slugs and the table name |
| `409` | Conflict — e.g. a database slug already exists | Choose a different name |
| `500` | SQL syntax, analysis, or execution error from the engine | Read the `error` string and check the SQL reference |
| `501` | Not implemented — a transaction statement over HTTP | Use the PostgreSQL protocol for transactions |
| `503` | The database instance is unavailable or paused | Retry; check the dashboard for the instance status |

## Authentication errors

| Message | Cause |
| --- | --- |
| `missing api key` | No `Authorization: Bearer` header |
| `invalid api key` | Key doesn't verify — wrong value, revoked, expired, or not a live key |
| `api key does not have database access permissions` | The key isn't a `DB_ACCESS` (or `REST_API`) key |
| `api key does not belong to this organization` | Key's org doesn't match the path |
| `api key does not have access to this database` | The key is scoped to a different database |

## Permission (scope) errors

These arrive as `403` with a message explaining the mismatch, for example:

```text
operation INSERT requires scope 'write' which is not granted to this API key
```

- `SELECT` requires `read`.
- `INSERT` / `UPDATE` / `DELETE` require `write`.
- `CREATE TABLE` / `ALTER TABLE` require `alter_table`.
- `DROP TABLE` requires `drop_table`.

For session-authenticated dashboard queries, the same operations map to member roles (`viewer` can read; `developer` and above can write and manage schema). See [API keys & permissions](/clients/api-keys/).

## PostgreSQL protocol errors

| Code | Meaning |
| --- | --- |
| `invalid_password` | The key (sent as the password) failed validation |
| `invalid_catalog_name` | The `database` parameter is missing the `/` — it must be `org/db` |
| `connection_failure` | The engine for your instance is unavailable |
| `insufficient_privilege` | A query exceeded the key's scopes |

## SQL errors

SQL itself can fail with syntax, analysis, or runtime errors. The managed API-key endpoint currently returns these with `500` and a message that includes the engine's reason:

```text
query error: near "SELEC": syntax error
```

Common causes:

- **`no such table`** — the table doesn't exist yet, or you're connected to the wrong database.
- **`syntax error`** — a typo, or Postgres-only syntax. PizzaSQL uses SQLite-compatible SQL; check [Compatibility](/sql-reference/compatibility/).
- **`duplicate primary key`** — an insert reused an existing primary-key value. Other `UNIQUE` constraints are not enforced.
- **`NOT NULL constraint failed`** — a `NULL` value in a `NOT NULL` column.

## Transactions over HTTP

Requests containing `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, or `RELEASE` are rejected with `501`:

```json
{ "error": "transactions are not supported by the HTTP query endpoint" }
```

This is by design — the HTTP API is stateless. Use the [PostgreSQL protocol](/clients/postgresql/) when you need transactions.

## Connection troubleshooting

- **SSL negotiation fails** — you're forcing TLS. The proxy declines SSL; connect with `sslmode=disable`.
- **`database must be "org/db"`** — the database name in your connection string is missing the `/` separator.
- **URI parse errors** — remember to percent-encode the database name's slash: `acme%2Fproduction`.

See [Connect](/getting-started/connect/) for the exact parameters.

## If you're still stuck

- Confirm the org and database slugs in the dashboard — they're the values used in every path and connection string.
- Verify the key's permission type and scopes, and that it hasn't been revoked.
- Check the instance status in the dashboard; a paused instance returns `503` or `connection_failure`.
- Test the health endpoint, which needs no auth: `GET https://db.database.pizza/acme/production/health`.
