---
title: Import & export
description: Move data into and out of your database using SQL dumps, CSV, and SQLite files.
---

database.pizza supports three ways to move data around:

- **SQL dumps** — a SQLite-compatible SQL script with schema and data.
- **CSV** — a single table's rows in comma-separated form.
- **SQLite files** — native `.db` / `.sqlite` / `.sqlite3` files.

Import and export happen through the dashboard (database **Settings → SQLite import and export**). There's no API-key-authenticated import/export endpoint — you either use the dashboard, or script your own using the [query API](/clients/http-api/) and [PostgreSQL protocol](/clients/postgresql/).

## Export a database

From the database's **Settings** page, choose **Export SQLite**. You'll download a SQL dump that includes both schema and data, in a form you can replay into any SQLite-compatible tool.

The dump is ordinary SQL. You can re-run it against a fresh database with `psql`:

```bash
PGPASSWORD='pz_live_REPLACE_ME' psql \
  "postgresql://u@db.database.pizza:5432/acme%2Fproduction?sslmode=disable" \
  -f production.sql
```

Or replay it through the HTTP API statement by statement.

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

## Related

- [Undo & recovery](/history/undo-recovery/) — the scoped-undo safety net that complements your exports.
- [HTTP query API](/clients/http-api/) — the endpoints used for DIY dumps.
- [Errors & troubleshooting](/guides/errors/) — import/export failure modes.
- [Compatibility](/sql-reference/compatibility/) — what SQL constructs survive a round-trip.
