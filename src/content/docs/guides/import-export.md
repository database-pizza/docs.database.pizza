---
title: Import & export
description: Move data into and out of your database using SQL dumps, CSV, and SQLite files.
---

database.pizza supports three ways to move data around:

- **SQL dumps** — a SQLite-compatible SQL script with schema and data.
- **CSV** — a single table's rows in comma-separated form.
- **SQLite files** — native `.db` / `.sqlite` / `.sqlite3` files.

Import and export happen through the dashboard (database **Settings → SQLite import and export**) or, for checksummed logical backups, through an MCP key with backup access. Logical backups are **SQL exports** with a checksum, not physical snapshots or point-in-time backups.

For app-level access, script imports and exports through your own server using the [query API](/clients/http-api/) and [PostgreSQL protocol](/clients/postgresql/). The dashboard-session import/export endpoints do not accept application API keys.

## Export a database

From the database's **Settings** page, choose **Export SQLite**. You'll download a SQL dump that includes both schema and data, in a form you can replay into any SQLite-compatible tool.

The dump is ordinary SQL. Replay it into a fresh database over a protected connection:

```bash
PGPASSWORD='pz_live_REPLACE_ME' psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=require" \
  -f production.sql
```

This requires a deployment that offers PostgreSQL TLS. The public endpoint
declined TLS on 2026-11-04; use HTTPS or a logical restore into a new database
while that is the case. Do not send a key over public plaintext. Replaying a
dump over HTTPS also requires splitting it into individual statements.

## Logical backups and restore

An MCP key with `backup_database` access creates a checksummed logical SQL export with `create_backup`.
These exports are bounded:

- **16 MiB** per export and **10 saved backups per database** (**128 MiB per
  workspace**).
- Stop writes and schema changes before creating one; export is not
  transactionally consistent.
- Ordinary indexes, unique indexes, defaults, and `AUTOINCREMENT` are included
  when the catalog can represent them safely. Index-level `ON CONFLICT` policies
  are not reconstructed; reapply them after restore. Unsupported schema
  features fail closed instead of producing a silently incomplete file.

`restore_backup` replays into a **new database**, never over the source. It
requires a free quota slot and a fresh name. A failed replay is reported as
`partial`; inspect or discard that new database rather than assuming success.
Keep independent exports of data you cannot afford to lose — these are not
physical snapshots, point-in-time recovery, or retained-history archives.

## Import a database

From **Settings**, choose a `.sql`, `.sqlite`, or `.db` file and **Import**. You'll get back a summary of what happened:

```json
{
  "tablesCreated":  ["users", "invoices"],
  "tablesImported": ["users", "invoices"],
  "rowsInserted":   27754,
  "indexesCreated": 61
}
```

- **Tables, their rows, and regular indexes** are imported.
- **Some constructs are skipped** during import: views, triggers, pragmas, expression indexes (for example `CREATE INDEX ON t(COALESCE(a, b))`), and `FOREIGN KEY` / `CHECK` constraints. Schema comes in without those; add any you need afterward.
- **Integer primary-key generation is automatic** — plain `INTEGER PRIMARY KEY` assigns a value when omitted. `AUTOINCREMENT` is accepted but adds no behavior.

### Continue on errors

The import dialog has a **Continue on statement errors** toggle. Leave it off to stop at the first problem; turn it on to skip individual failing rows or statements and import everything else, with skipped errors reported in the summary.

## CSV import and export

CSV is always **table-scoped**. To export one table to CSV, or to load a CSV into a table, use the API from your own code or tooling. For a table `users`:

```bash
# Export one table as CSV (requires a dashboard session, e.g. via the web app)
curl -s "https://app.database.pizza/api/v1/databases/{id}/export-csv?table=users" -H "Cookie: session_id=…"
```

Because the CSV endpoints require a dashboard session rather than an API key, most teams find it simpler to generate CSVs themselves from a `SELECT` through the query API:

```bash
curl -s https://db.database.pizza/acme/production/query \
  -H "Authorization: Bearer pz_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM users"}' \
  | jq -r '.columns | map(.name) | @csv, (.rows[] | @csv)'
```

On import, a CSV's first row is treated as a header unless you create the table yourself first. Give the target table explicitly when loading CSV.

## Bringing in an existing SQLite database

If you're migrating from SQLite, the fastest path is the dashboard import of your `.db` file. Everything in the "what gets imported" list above applies, so review the skipped constructs before you cut over.

## Scripting your own exports

You don't need a dedicated export feature for simple cases. A dump is just schema plus rows. Use the query API to pull table names, then each table's `CREATE TABLE` and rows, and assemble them into a script:

1. `GET /acme/production/schema/tables` to list tables.
2. `GET /acme/production/schema/tables/{table}` for each table's columns.
3. `SELECT * FROM {table}` for the rows.

This gives you full control over the output and works from any environment.

## Backups during the beta

database.pizza takes a nightly off-host backup of every workspace and keeps roughly the 14 most recent runs. A backup is a copy of the storage journal taken while the database is running, so it reflects a point during the copy rather than a transaction boundary: the most recent committed write can be missing, and a torn trailing record is discarded when the file is opened.

Backups are **best effort** during the beta. They are not a service-level guarantee, and [history and undo](/history/undo-recovery/) are repair tools rather than a backup system. Export your data regularly — weekly at minimum, and always before a schema migration — and keep an independent copy.

To restore, contact <webmaster@database.pizza> or use the support form with the workspace name and the approximate date. Restore is operator-run during the beta: we bring the backup up in a scratch location first so live data is never overwritten, report what recovered, and only then move data. A workspace restore does not automatically rebuild every index or constraint; verify them after the restore.

## Related

- [Undo & recovery](/history/undo-recovery/) — the scoped-undo safety net that complements your exports.
- [HTTP query API](/clients/http-api/) — the endpoints used for DIY dumps.
- [Errors & troubleshooting](/guides/errors/) — import/export failure modes.
- [Compatibility](/sql-reference/compatibility/) — what SQL constructs survive a round-trip.
