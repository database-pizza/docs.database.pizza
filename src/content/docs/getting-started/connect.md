---
title: Connect
description: Connection strings and parameters for the PostgreSQL wire protocol and the HTTP query API.
---

Everything you connect to lives at the host `db.database.pizza`. Your organization and database slugs form the routing path: for org `acme` and database `production`, that path is `acme/production`.

There are two connection surfaces, and they share the same API key.

| Surface | Endpoint | Authentication |
| --- | --- | --- |
| PostgreSQL wire protocol | `db.database.pizza:5432` | API key as password |
| HTTP query API | `https://db.database.pizza/acme/production/query` | API key as `Authorization: Bearer` |

## PostgreSQL wire protocol

Connect to `db.database.pizza` on port `5432` the way you would a PostgreSQL server. Three things are different from a stock Postgres setup:

1. **The database name is `acme/production`** — organization and database joined by a slash. It's a single name, not two path segments.
2. **The password is your API key.** The user field is ignored; you can use any value (the examples use `u`).
3. **TLS is declined.** The proxy currently answers SSL negotiation with `N`, so connect with `sslmode=disable`. Don't require or verify TLS here — it will fail.

### Connection string

```text
postgresql://u:pz_live_REPLACE_ME@db.database.pizza:5432/acme%2Fproduction?sslmode=disable
```

The slash in the database name must be percent-encoded as `%2F` when a client parses the URI (libpq, `pg`, SQLAlchemy, JDBC, and most others do). If your client takes discrete fields instead of a URI — many GUIs do — enter `acme/production` literally in the database field, no encoding.

### With `psql`

```bash
PGPASSWORD='pz_live_REPLACE_ME' psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=disable"
```

`psql` also accepts the parts as flags:

```bash
PGPASSWORD='pz_live_REPLACE_ME' psql \
  -h db.database.pizza -p 5432 -U u -d acme/production
```

## HTTP query API

Send a JSON body to the query endpoint with the key in a Bearer header:

```bash
curl -s https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer pz_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT version()"}'
```

The HTTP surface also exposes a batch endpoint, schema introspection, and a health check. See [HTTP query API](/clients/http-api/) for the full reference.

## Connection parameters

| Parameter | PostgreSQL | HTTP |
| --- | --- | --- |
| Host | `db.database.pizza` | `https://db.database.pizza` |
| Port | `5432` | `443` |
| Database | `acme/production` | path segment `/acme/production` |
| User | ignored (use `u`) | — |
| Password / token | API key | `Authorization: Bearer <key>` |
| SSL | `sslmode=disable` (TLS declined) | HTTPS only |

## Which should I use?

- **PostgreSQL wire protocol** is useful when you have a tested Postgres driver or `psql`-style workflow. It is the only surface that supports transactions (optimistic DML transactions — see [Transactions](/engine/transactions/)). It is **not** a full PostgreSQL surface: the SQL dialect is SQLite-style, and compatibility is partial.
- **HTTP query API** is best for serverless functions, edge workloads, and environments where a long-lived database connection isn't practical. Transactions are **not** supported over HTTP — use the Postgres protocol when you need them. Do not expose a database API key in browser code.

> **TLS warning.** The PostgreSQL proxy currently **declines SSL**. All wire-protocol connections use `sslmode=disable`, so your API key and query traffic are **sent in cleartext**. Avoid using the wire protocol for sensitive data over an untrusted network; prefer the HTTPS-only HTTP API when confidentiality matters. See [API keys & permissions](/clients/api-keys/).

Both surfaces enforce the same API key scopes. See [API keys & permissions](/clients/api-keys/) and [PostgreSQL clients](/clients/postgresql/) for idiomatic client examples.

## Troubleshooting

- **`invalid_password` / "authentication failed"** — the key is wrong, revoked, or lacks `DB_ACCESS` permission. Check the key and its scopes.
- **`invalid_catalog_name` / "database must be org/db"** — the database name doesn't contain the `/`. Use `acme/production`.
- **SSL negotiation fails** — you forced TLS. Use `sslmode=disable`.
- **`invalid api key`** — the key isn't a valid live key, or you pasted it with whitespace.

More error cases are covered in [Errors & troubleshooting](/guides/errors/).
