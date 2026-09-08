---
title: REST API (preview)
description: Preview the auto-generated CRUD endpoints for your tables, secured by DB_ACCESS or REST_API keys.
---

The REST surface exposes tables as small CRUD resources, without requiring clients to write SQL. Routes are derived from table names and live under `/api/`.

> **Preview:** The endpoints are available, but the console does not yet expose the full `REST_API` key and per-table configuration flow. A `DB_ACCESS` key can use these routes today and is governed by its `read` and `write` scopes. Treat this surface as beta.

```text
GET    /{org}/{db}/api/{table}           list rows
POST   /{org}/{db}/api/{table}           insert a row
GET    /{org}/{db}/api/{table}/{id}      fetch one row
PATCH  /{org}/{db}/api/{table}/{id}      update one row
DELETE /{org}/{db}/api/{table}/{id}      delete one row
```

For org `acme` and database `production`, the `users` table is at `https://db.database.pizza/acme/production/api/users`.

## Enabling a table

Per-table method settings can restrict `REST_API` keys to selected tables and verbs. `DB_ACCESS` keys bypass those method settings because they already grant SQL access. The console configuration flow for dedicated `REST_API` keys is not yet available.

Single-row routes (`GET/PATCH/DELETE …/{id}`) look up rows by an `id` column, so a table intended for REST access should define `id INTEGER PRIMARY KEY`.

## Authentication

REST requests use a Bearer API key, exactly like the [HTTP query API](/clients/http-api/):

```text
Authorization: Bearer pz_live_REPLACE_ME
```

Two key types work here:

- **`REST_API`** keys are purpose-built for these endpoints. They are scoped to `read` and/or `write`, bound to one database, and further restricted by each table's method settings.
- **`DB_ACCESS`** keys also work and bypass the per-table method check, since they already carry full SQL scopes.

See [API keys & permissions](/clients/api-keys/) for how to create each.

## List rows

```bash
curl -s "https://db.database.pizza/acme/production/api/users?limit=20&offset=0" \
  -H "Authorization: Bearer pz_live_REPLACE_ME"
```

```json
{
  "data": [
    { "id": 1, "name": "Ada Lovelace", "email": "ada@acme.example" }
  ],
  "limit": 20,
  "offset": 0
}
```

Query parameters:

| Param | Default | Notes |
| --- | --- | --- |
| `limit` | `100` | Max `1000` |
| `offset` | `0` | — |
| `{column}` | — | Any other parameter filters by equality, e.g. `?plan=pro` |

Only column names that exist on the table are accepted as filters; unknown parameters are ignored.

## Fetch one row

```bash
curl -s "https://db.database.pizza/acme/production/api/users/1" \
  -H "Authorization: Bearer pz_live_REPLACE_ME"
```

```json
{ "data": { "id": 1, "name": "Ada Lovelace", "email": "ada@acme.example" } }
```

Returns `404` when no row matches.

## Insert a row

```bash
curl -s -X POST "https://db.database.pizza/acme/production/api/users" \
  -H "Authorization: Bearer pz_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"name": "Grace Hopper", "email": "grace@acme.example"}'
```

```json
{ "last_insert_id": 0, "rows_affected": 1 }
```

Only known columns are accepted; an unknown column is rejected with `400`. Omit the `id` column and it is assigned automatically. `last_insert_id` is currently always `0`, so do not use it to discover the generated value.

## Update a row

```bash
curl -s -X PATCH "https://db.database.pizza/acme/production/api/users/2" \
  -H "Authorization: Bearer pz_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"plan": "pro"}'
```

```json
{ "rows_affected": 1 }
```

Sends a partial update — only the columns you provide are changed.

## Delete a row

```bash
curl -s -X DELETE "https://db.database.pizza/acme/production/api/users/2" \
  -H "Authorization: Bearer pz_live_REPLACE_ME"
```

```json
{ "rows_affected": 1 }
```

## Errors

| Status | Meaning |
| --- | --- |
| `401` | Missing or invalid API key |
| `403` | Key type doesn't permit REST access, lacks the `read`/`write` scope, or the method isn't enabled for this table |
| `404` | Organization, database, table, or row not found |
| `400` | Invalid table name, unknown column, or empty body |

The error body is `{"error": "…"}`. Full troubleshooting is in [Errors & troubleshooting](/guides/errors/).

## REST vs. the query API

Use the REST API when you want predictable, single-table CRUD with minimal attack surface (it only ever touches the tables you enable). Use the [HTTP query API](/clients/http-api/) or [PostgreSQL protocol](/clients/postgresql/) when you need joins, arbitrary SQL, or transactions.
