---
title: HTTP query API
description: Reference for the managed HTTP endpoint that executes SQL with a Bearer API key.
---

The HTTP query API lets you run SQL over HTTPS with an API key — no driver, no connection pooling, no long-lived socket. It's ideal for serverless functions and edge workers. Do not call it with a secret key embedded in public browser code; route those requests through a backend you control.

> **Managed vs. engine.** This page documents the managed endpoint at `db.database.pizza`. PizzaSQL, the engine, exposes its own raw HTTP API internally (`POST /query` with an `X-Database` header, no auth); that is not for direct customer use. The managed API adds `<org>/<db>` routing, API key authentication, and scope enforcement on top.

## Authentication

Every request requires a `DB_ACCESS` API key in the `Authorization` header:

```text
Authorization: Bearer pz_live_REPLACE_ME
```

The key must belong to the organization in the path and have access to the database. Statements are then checked against the key's scopes. See [API keys & permissions](/clients/api-keys/).

## Execute a query

`POST /{org}/{db}/query`

```bash
curl -s https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer pz_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM users WHERE plan = ?", "params": ["pro"]}'
```

Request body:

| Field | Type | Description |
| --- | --- | --- |
| `sql` | string | The SQL statement (required). |
| `params` | array | Positional parameters for `?` placeholders (optional). PostgreSQL-style `$1` placeholders apply only to the wire protocol. |

Response:

```json
{
  "columns": [
    { "name": "id",   "type": "INTEGER" },
    { "name": "name", "type": "TEXT" }
  ],
  "rows": [
    [1, "Ada Lovelace"],
    [2, "Grace Hopper"]
  ],
  "rowsReturned": 2,
  "executionTimeMicro": 108,
  "bytesRead": 38
}
```

- `columns` is an array of `{name, type}` objects.
- `rows` is an array of arrays, values JSON-encoded.
- `rowsAffected` reports affected rows for writes. Zero-valued fields are omitted from the JSON response.
- `lastInsertId` exists in the response schema but is currently not populated. If you need a generated ID, prefer assigning it in your application.
- `executionTimeMicro` is engine execution time in microseconds; `bytesRead` is the approximate result size.

The same endpoint runs `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and DDL. One statement per request; you cannot `BEGIN`/`COMMIT` here (see below).

## Batch execution

`POST /{org}/{db}/execute`

Run several statements in one request. Each is validated against your scopes individually, and statements run in order.

```bash
curl -s https://db.database.pizza/acme/production/execute \
  -H "Authorization: Bearer pz_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{
    "statements": [
      { "sql": "INSERT INTO users (name) VALUES (?)", "params": ["Ada"] },
      { "sql": "INSERT INTO users (name) VALUES (?)", "params": ["Grace"] }
    ]
  }'
```

The body accepts `statements` (an array of `{sql, params}`). A `transaction` flag exists but is **not supported** — the endpoint rejects it, and it should be left unset or `false`.

```json
{
  "results": [
    { "rowsAffected": 1, "executionTimeMicro": 42 },
    { "rowsAffected": 1, "executionTimeMicro": 37 }
  ]
}
```

Each item is a full query-response object. Depending on the statement, it can also include `columns`, `rows`, `rowsReturned`, and `bytesRead`; zero-valued fields are omitted.

## Introspection

`GET /{org}/{db}/schema/tables`

```bash
curl -s https://db.database.pizza/acme/production/schema/tables \
  -H "Authorization: Bearer pz_live_REPLACE_ME"
```

```json
{ "tables": ["users", "invoices"] }
```

`GET /{org}/{db}/schema/tables/{table}` returns column metadata for one table.

Both require the `read` scope.

## Health check

`GET /{org}/{db}/health` returns `{"status":"ok"}` and does **not** require authentication.

## Transactions are not supported

The HTTP API is stateless. Any request containing `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, or `RELEASE` is rejected with `501 Not Implemented`. If you need multi-statement atomicity, use the [PostgreSQL protocol](/clients/postgresql/) instead.

## Errors

Errors come back as JSON with an `error` string and a non-2xx status:

```json
{ "error": "permission denied: operation INSERT requires scope 'write' which is not granted to this API key" }
```

Common cases:

| Status | Meaning |
| --- | --- |
| `400` | Malformed JSON body |
| `401` | Missing or invalid API key |
| `403` | Key lacks the required scope, or doesn't have access to this database |
| `404` | Unknown organization or database slug |
| `500` | SQL syntax, analysis, or execution error returned by the engine |
| `501` | Transaction statement |

See [Errors & troubleshooting](/guides/errors/) for the full table and fixes.

## Related

- [JavaScript](/clients/javascript/) and [Python](/clients/python/) — idiomatic HTTP examples.
- [REST API](/clients/rest-api/) — CRUD endpoints that don't require writing SQL.
