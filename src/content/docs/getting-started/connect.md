---
title: Connect
description: Connect agents with MCP and apps or scripts with HTTPS; use the partial PostgreSQL wire interface only over a protected connection.
---

Open [app.database.pizza/start](https://app.database.pizza/start) to sign up. Your default workspace is created automatically. Copy the agent instructions from the workspace; copying creates a 6-hour setup-only MCP key and puts it in the prompt. Manage or revoke MCP keys under **Workspace → MCP**.

| Surface | Endpoint | Authentication |
| --- | --- | --- |
| MCP Streamable HTTP | `https://db.database.pizza/mcp` | Workspace `AGENT` key as Bearer token |
| HTTPS query API | `https://db.database.pizza/acme/production/query` | Database-scoped `DB_ACCESS` key as Bearer token |
| Partial PostgreSQL wire | `db.database.pizza:5432` | Database key as password; TLS depends on deployment |

`acme/production` is a fictional organization/database path. Workspace agent
connections select a database per call and cannot reach other workspaces. App
credentials use separate database-scoped keys. See
[API keys & permissions](/clients/api-keys/).

## HTTPS for scripts and application backends

With `PZ_API_KEY` set privately in your local environment:

```bash
curl --fail-with-body https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer $PZ_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT 1 AS ready"}'
```

Use the [HTTP query API](/clients/http-api/) for response details, batching, parameters, and errors. Never ship the key to public browser code; call from your own backend.

## MCP for coding agents

Copy the instructions from the workspace and give them to your agent. The prompt
contains the MCP URL and a 6-hour setup key, and the agent configures its own
client. Reopen the client session if new MCP tools are not visible. See
[MCP for agents](/clients/mcp/).

## PostgreSQL wire and TLS

PizzaSQL implements a **partial** PostgreSQL wire protocol. The SQL is SQLite-inspired; test your exact driver and workload. Transactions are available through the wire interface, not over HTTPS or MCP.

**Source capability:** the managed proxy implements TLS 1.2+ termination, configurable with `PGPROXY_TLS_CERT`, `PGPROXY_TLS_KEY`, and `PGPROXY_TLS_MODE=off|optional|required`. With a certificate, `optional` offers TLS while retaining plaintext compatibility; `required` rejects plaintext startup. TLS ends at the proxy; the engine hop is plaintext loopback.

**Public deployment observation:** on 2026-11-04, a credential-free PostgreSQL `SSLRequest` to `db.database.pizza:5432` returned `N`, meaning TLS was not offered. This check sent no login, key, SQL, or database name. It does not imply that the source lacks TLS support, and configuration can change.

**Use HTTPS or MCP over public networks until PostgreSQL TLS is installed. Do not fall back to public plaintext to make a connection work.** `sslmode=disable` is only appropriate on a deliberately trusted local/tunneled hop. No certificate installation or TLS enforcement rollout is implied by these docs.

For a **TLS-enabled deployment**, a connection URI is:

```text
postgresql://u:pz_live_REPLACE_ME@db.database.pizza:5432/acme%2Fproduction?sslmode=require
```

Or, with the key kept out of the URI:

```bash
PGPASSWORD="$PZ_API_KEY" psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=require" \
  -c 'SELECT 1 AS ready'
```

This deliberately fails if the server declines TLS. For certificate and hostname validation, prefer `sslmode=verify-full` with a trusted hostname-matching certificate. Do not disable validation as a generic workaround.

The database name is `acme/production`, including the slash. Percent-encode it as `acme%2Fproduction` in a URI; use the literal string in discrete driver/GUI fields. The user field is ignored (`u` is conventional); the password is the API key.

## Choosing a surface

- **MCP:** agent schema discovery and one-statement SQL tools.
- **HTTPS:** server-side scripts, small app backends, serverless functions. No connection pool needed.
- **PostgreSQL wire:** tested drivers and optimistic DML transactions, on a protected connection. It is not PostgreSQL semantics or universal ORM compatibility.

All three enforce key scopes. No transactions over MCP or HTTPS. Read [Compatibility](/sql-reference/compatibility/) before generating SQL and [PostgreSQL clients](/clients/postgresql/) before relying on a driver.

## Troubleshooting

- **Invalid/revoked API key:** configure a valid local key or create a replacement; keys cannot be revealed again.
- **Permission denied:** check the database binding and scopes. Read-only keys cannot create tables.
- **Database name must be org/db:** include the slash and encode it in a URI.
- **TLS required but not offered:** use HTTPS/MCP or ask the operator to install PostgreSQL TLS. Do not send credentials over public plaintext.
- **Certificate verification failure:** verify hostname, trust chain, and expiry; do not simply turn verification off.

See [Errors & troubleshooting](/guides/errors/) for other failure responses.
