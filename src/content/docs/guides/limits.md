---
title: Limits & quotas
description: The resource limits that apply to your databases and the SQL compatibility boundaries you should know.
---

This page covers two kinds of limits: **resource quotas** on the service, and **SQL compatibility** limits inherited from the PizzaSQL engine.

> **Beta note.** database.pizza is under active development. The quota defaults below are the current values and may change as plans evolve; treat them as indicative rather than contractual.

## Resource quotas

Quotas apply per organization and cover four dimensions:

| Dimension | Current default | What counts |
| --- | --- | --- |
| Databases | 3 | Active databases in the organization |
| Storage | 100 MB | Allocated on-disk space for the organization |
| Queries | 500,000 / week | Queries across all surfaces |
| Connections | 64 concurrent | Open PostgreSQL connections |

Queries and bytes-read are counted per organization per week; concurrent connections are measured at any instant. Usage is visible in the dashboard's **Quota** view and through `GET /api/v1/orgs/{id}/quota`, which returns `usage.active_connections` alongside `quota.max_concurrent_connections`.

The default is 64 concurrent connections for new organizations. Migration `020` raises every existing organization from the earlier temporary cap of 8 to 64; organizations with a larger pooled workload can have an explicit override. The value shown in the dashboard is authoritative.

### Connections and idle disconnects

When the connection quota is exhausted, the proxy returns SQLSTATE `53300` with the current and limit numbers (for example `8/8 connections active`) and a retry hint in the message, plus a `connection_quota` detail. It briefly waits for a slot to free before failing. Treat `53300` as retryable with backoff and check for leaked client-side pool connections.

Neither the proxy nor the engine sets an idle timeout. A connection that goes away after sitting idle is closed by the network path (NAT/firewall state expiry) or by the client pool, not by database.pizza. The proxy enables TCP keepalive on both hops (30s idle, 10s interval) so state stays warm and a dead peer is detected, but clients should still enable keepalive, bound pool `max_lifetime`/`idle_timeout`, and retry a connection that fails its first statement.

When you hit a quota:

- Creating another database beyond the database limit is rejected.
- Exceeding storage prevents further writes that would grow the data.
- The query and connection quotas cap sustained load until the window or connections free up.

If you need more, the limits are configurable per organization — reach out through the dashboard rather than working around them.

## API and endpoint limits

- **REST list results** default to `100` rows and cap at `1000` per request (`limit` parameter).
- **Import uploads** are size-limited: SQL and CSV multipart uploads cap at 32 MB; SQLite imports cap at 128 MB.
- **One statement per `/query` request.** Use `/execute` to batch several, or the PostgreSQL protocol for scripts and transactions.
- **No transactions over HTTP.** `BEGIN`/`COMMIT` and friends return `501`; use the PostgreSQL protocol instead.

## SQL compatibility limits

PizzaSQL is **SQLite-compatible**, not PostgreSQL. The most common surprises when coming from Postgres:

- **`SERIAL` and sequences** don't exist — use `INTEGER PRIMARY KEY`. Values are assigned automatically when omitted.
- **`VARCHAR(n)`** is accepted but not length-enforced — use `TEXT`.
- **No schemas, roles, `ARRAY`, `JSONB`, or `ENUM`** types.
- **No `CREATE DATABASE`/`DROP DATABASE`** from a client — databases are managed in the dashboard (and require the platform's `create_database` scope, not a client key).
- **Type affinity** is SQLite-style, so column types are hints more than strict constraints.

The complete, authoritative list is on the [Compatibility](/sql-reference/compatibility/) page — read it before generating production SQL.

## What isn't imported

Imports of existing SQLite databases skip several constructs: views, triggers, pragmas, expression indexes, and `FOREIGN KEY` / `CHECK` constraints. See [Import & export](/guides/import-export/).

## TLS and connectivity

The managed PostgreSQL proxy supports TLS termination with a deployment setting (`PGPROXY_TLS_MODE`):

- `optional` (default when a certificate is installed) offers TLS; `sslmode=prefer`/`require` clients upgrade, while `sslmode=disable` clients keep working.
- `required` rejects plaintext startup with `08P01`. Clients pinned to `sslmode=disable` or `ssl: false` must be updated first.
- `off` disables TLS even if certificate paths are configured.

If SSL negotiation is declined, that deployment has no certificate installed and only `sslmode=disable` works; use it only over a trusted hop. The HTTP surface is HTTPS-only. TLS ends at the proxy: the loopback hop to PizzaSQL is plaintext. See the security notes in [API keys & permissions](/clients/api-keys/) and the client impact matrix in [PostgreSQL clients](/clients/postgresql/#discovery-and-quota-errors).

## Related

- [Errors & troubleshooting](/guides/errors/) — what a quota or compatibility failure looks like.
- [Compatibility](/sql-reference/compatibility/) — the SQL dialect boundaries.
- [Indexes](/engine/indexes/) — keep queries fast within your quota.
