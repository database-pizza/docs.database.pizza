---
title: API keys & permissions
description: How API keys work, what scopes mean, and how to keep them safe.
---

Every programmatic connection to database.pizza authenticates with an API key. Depending on its permission type, a key authenticates:

- The [MCP endpoint](/clients/mcp/) and [HTTPS query API](/clients/http-api/) with `Authorization: Bearer` (`DB_ACCESS`).
- The [REST API](/clients/rest-api/) with a Bearer token (`REST_API`, or scoped `DB_ACCESS`).
- The [partial PostgreSQL wire interface](/clients/postgresql/) with the key as its password (`DB_ACCESS`).

Keys belong to an **organization**, not your entire account. Application `DB_ACCESS` keys are additionally bound to **one database**. Only browser-approved agent connections can span databases within a single workspace; they cannot reach another organization or account settings.

Treat application keys accordingly — a key is a password and a bearer token in one.

## Key format

Live keys look like this:

```text
pz_live_…
```

The `pz_` prefix and the environment segment (`live`) are followed by a long random value. The dashboard shows only a short prefix of an existing key after creation; the full key is displayed **exactly once**, at creation time. Copy it immediately — there's no way to retrieve it later.

## Permission types

Keys fall into four permission types:

| Type | Purpose | Bound to a database? |
| --- | --- | --- |
| `DB_ACCESS` | SQL over HTTPS and the partial PostgreSQL wire interface, constrained by scopes | Yes (required) |
| `AGENT` | Browser-approved workspace MCP connection created by the local helper; expires after 7 days | No — workspace-scoped |
| `REST_API` | CRUD via the [REST API](/clients/rest-api/), constrained by scopes and per-table method settings | Yes (required) |
| `PLATFORM` | Reserved for platform-level operations | No |

For day-to-day application access you'll use `DB_ACCESS`. `AGENT` keys are not listed with database API keys
and cannot be created through the API-key dialog; they appear under **Workspace
settings → Agent connections** and require an explicit browser approval. The dedicated `REST_API` configuration
flow is still in preview.

## Scopes

Scopes constrain what a key can do. A key with no granted scope is denied everything; grant only what a workload needs.

### `DB_ACCESS` scopes

| Scope | Allows |
| --- | --- |
| `read` | `SELECT` |
| `write` | `INSERT`, `UPDATE`, `DELETE` |
| `alter_table` | `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, `DROP INDEX` |
| `drop_table` | `DROP TABLE` |
| `listen:<pattern>` | `LISTEN`, `UNLISTEN`, and SSE channel subscriptions |
| `notify:<pattern>` | `NOTIFY` |

Statements are validated against these scopes on every request over MCP, HTTPS, and the PostgreSQL wire interface. A `DROP TABLE` requires the explicit `drop_table` scope; schema changes require `alter_table`.

Channel scopes are separate from the data scopes: `read` does not grant `LISTEN`, and a `listen:orders.*` scope does not grant `SELECT`. Patterns are an exact channel name or a prefix ending in `*`. See [Notifications](/sql-reference/notifications/).

`AGENT` keys use the same data scopes plus workspace scopes:

| Scope | Allows |
| --- | --- |
| `create_database` | Create a database in the approved workspace |
| `drop_database` | Delete databases and saved backups, and `DROP TABLE` (requires the destructive approval checkbox) |
| `view_metrics` / `view_quotas` | Read workspace metrics and quota |
| `pause_database` | Pause or resume databases |
| `backup_database` | Create, list, and download logical backups (deleting one also needs `drop_database`) |
| `restore_database` | Restore a logical backup into a new database (also needs `create_database`) |
| `create_app_key` | Create a separate database-scoped application key through the private local helper |

Default agent approval does not include `drop_database` or `drop_table`. It
does include row deletion and schema/index changes. See
[MCP for agents](/clients/mcp/).

### `REST_API` scopes

| Scope | Allows |
| --- | --- |
| `read` | `GET` on enabled tables |
| `write` | `POST`, `PATCH`, `DELETE` on enabled tables |

`REST_API` keys are additionally limited by each table's method toggles — even with the `write` scope, a table won't accept `DELETE` unless `DELETE` is enabled for it. `DB_ACCESS` keys bypass the per-table toggles.

## Creating and revoking keys

1. Open a database in the dashboard and go to **API keys**.
2. Choose **Create API key**, name it, and select its scopes. For MCP, copy the
   instructions from the workspace empty state instead; approved agent
   connections are created through a browser confirmation, not the key dialog.
3. Copy the key from the confirmation dialog — this is the only time it's shown.

Revoking a key denies subsequent authenticated MCP/HTTPS requests. It does not undo writes, cancel an in-flight request, or guarantee termination of an already authenticated PostgreSQL tunnel. Revoke keys you no longer need, and rotate them on suspicion of exposure.

New application keys can grant `read`, `write`, and `alter_table`; `drop_table`
is a separate scope. Build access still permits row deletion and structural
changes. Use separate keys per client; create a replacement, update the client,
verify it, then revoke the old key. The console never retrieves an existing full
key.

Workspace agent connections appear in **Workspace settings → Agent connections**,
not in the database API-key list. Revoking one denies new agent requests; it does
not undo completed writes or revoke separate application keys the agent created.

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
- `DB_ACCESS`, `REST_API`, and `AGENT` keys are organization-scoped; `DB_ACCESS` and `REST_API` are also database-scoped.
- A key used for the Postgres protocol is sent as the password to the proxy. TLS terminates at the proxy when the deployment installs a certificate (`sslmode=require`); without one the key crosses the client-to-proxy hop in cleartext. The proxy-to-engine loopback hop is always plaintext (see [Connect](/getting-started/connect/)).

## Next

- [Connect](/getting-started/connect/) — put a key to work.
- [REST API](/clients/rest-api/) — what `REST_API` keys can reach.
- [Limits & quotas](/guides/limits/) — what counts against your plan.
