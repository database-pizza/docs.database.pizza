---
title: API keys & permissions
description: How API keys work, what scopes mean, and how to keep them safe.
---

Every programmatic connection to database.pizza authenticates with an API key. The same key serves three roles:

- The `Authorization: Bearer` token for the [HTTP query API](/clients/http-api/) and [REST API](/clients/rest-api/).
- The **password** for the [PostgreSQL protocol](/clients/postgresql/).

Treat it accordingly — it's a password and a bearer token in one.

## Key format

Live keys look like this:

```text
pz_live_…
```

The `pz_` prefix and the environment segment (`live`) are followed by a long random value. The dashboard shows only a short prefix of an existing key after creation; the full key is displayed **exactly once**, at creation time. Copy it immediately — there's no way to retrieve it later.

## Permission types

Keys fall into three permission types:

| Type | Purpose | Bound to a database? |
| --- | --- | --- |
| `DB_ACCESS` | Full SQL access over the query API and Postgres protocol, constrained by scopes | Yes (required) |
| `REST_API` | CRUD via the [REST API](/clients/rest-api/), constrained by scopes and per-table method settings | Yes (required) |
| `PLATFORM` | Reserved for platform-level operations | No |

For day-to-day application access you'll use `DB_ACCESS`. The dedicated `REST_API` configuration flow is still in preview.

## Scopes

Scopes constrain what a key can do. A key with no granted scope is denied everything; grant only what a workload needs.

### `DB_ACCESS` scopes

| Scope | Allows |
| --- | --- |
| `read` | `SELECT` |
| `write` | `INSERT`, `UPDATE`, `DELETE` |
| `alter_table` | `CREATE TABLE`, `ALTER TABLE` |
| `drop_table` | `DROP TABLE` |

Statements are validated against these scopes on every request, over both HTTP and the Postgres protocol. A `DROP TABLE` requires the explicit `drop_table` scope; schema changes require `alter_table`.

### `REST_API` scopes

| Scope | Allows |
| --- | --- |
| `read` | `GET` on enabled tables |
| `write` | `POST`, `PATCH`, `DELETE` on enabled tables |

`REST_API` keys are additionally limited by each table's method toggles — even with the `write` scope, a table won't accept `DELETE` unless `DELETE` is enabled for it. `DB_ACCESS` keys bypass the per-table toggles.

## Creating and revoking keys

1. Open a database in the dashboard and go to **API keys**.
2. Choose **Create API key**, name it, and select the permission type and scopes.
3. Copy the key from the confirmation dialog — this is the only time it's shown.

Revoking a key takes effect immediately; any application using it loses access on the next request. Revoke keys you no longer need, and rotate them on any suspicion of exposure.

## Security guidance

- **Never commit keys.** Put them in environment variables or a secret manager, and reference them from there (e.g. `process.env.PZ_API_KEY`).
- **Never ship keys to the browser.** Route browser requests through your own backend, which holds the key server-side. A live key embedded in client code is effectively public.
- **Grant the least privilege that works.** Use a `read`-only key for dashboards and reporting, a `write` key for ingestion, and reserve `alter_table`/`drop_table` for migrations you run deliberately.
- **Use separate keys per workload.** Distinct keys let you revoke one consumer without disrupting another, and make audit logs more meaningful.
- **Keep the key out of logs.** If you build a wrapper, redact the `Authorization` header in error output.
- **Use narrow REST access when the preview controls are available.** Per-table method toggles can expose a smaller surface than arbitrary SQL, but a key shipped to a browser is still public.
- **Parameterize your queries.** Scopes protect against *which* statements run; placeholders (`?` / `$1`) protect against SQL injection in the values. Do both.

## Key details at a glance

- Keys are stored hashed; only the prefix is visible after creation.
- `DB_ACCESS` and `REST_API` keys are bound to a database. Reserved platform keys are organization-level.
- A key used for the Postgres protocol is sent as a cleartext password to the proxy, and the proxy currently declines TLS — factor that into how you handle the connection (see [Connect](/getting-started/connect/)).

## Next

- [Connect](/getting-started/connect/) — put a key to work.
- [REST API](/clients/rest-api/) — what `REST_API` keys can reach.
- [Limits & quotas](/guides/limits/) — what counts against your plan.
