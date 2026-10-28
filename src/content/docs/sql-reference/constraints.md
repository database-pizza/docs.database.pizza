---
title: Constraints
description: What PRIMARY KEY, NOT NULL, DEFAULT, UNIQUE, CHECK, and FOREIGN KEY actually do in PizzaSQL — and which ones are not enforced.
---

Constraints in PizzaSQL fall into two camps: the ones that are actually implemented, and the ones that merely parse. This page is deliberately blunt about the difference, because silently assuming a `CHECK` or `FOREIGN KEY` constraint is enforced will corrupt data. `UNIQUE` is now enforced on the core write paths, with caveats described below.

## The enforced constraints

### PRIMARY KEY

- A single column can be `PRIMARY KEY`. A table-level `PRIMARY KEY (col)` is also accepted.
- A composite primary key (`PRIMARY KEY (a, b)`) is rejected at `CREATE TABLE` with SQLSTATE `0A000`; it is never silently reduced to the first column.
- An **`INTEGER PRIMARY KEY`** column becomes an alias for the implicit rowid. Inserting without a value auto-assigns the next rowid; inserting with a value sets the rowid and advances the counter past it.
- A **non-integer primary key** (e.g. `TEXT PRIMARY KEY`) is a normal column with a separate hidden rowid counter.
- The primary key drives **duplicate detection** on `INSERT`, and therefore `INSERT OR REPLACE`/`OR IGNORE` and `ON CONFLICT DO NOTHING`/`DO UPDATE` — all of which are keyed on the primary key only.
- Without any declared primary key, the engine assigns a synthetic `_rowid_` primary key, so duplicate and NULL values are allowed in user columns.

### NOT NULL

- `NOT NULL` is enforced on `INSERT`: inserting a row that omits a `NOT NULL` column with no default is rejected with `missing required column`.
- It does **not** enforce on `UPDATE` to `NULL` in all paths, and does not validate type.

### DEFAULT

- `DEFAULT expr` is evaluated when the table is created, then stored and applied to inserted rows that omit the column.
- Because it's evaluated at DDL time, only constant expressions are useful. There is no `DEFAULT (expr)` re-evaluation per row.
- A non-constant default (`CURRENT_TIMESTAMP`, `datetime('now')`, a scalar function call, a column reference) is **rejected at DDL with SQLSTATE `0A000`**. Accepting it would silently freeze one value for the life of the table. Declare the column without a default and supply a fresh value on each `INSERT`.
- A constant `DEFAULT` on `ADD COLUMN` applies to later inserts only; existing rows are not backfilled. See [ALTER TABLE](/sql-reference/statements/#alter-table).

### AUTOINCREMENT

- `AUTOINCREMENT` **parses but has no behaviour**. It does not prevent rowid reuse, does not maintain a separate sequence, and behaves exactly like a plain `INTEGER PRIMARY KEY`.
- It is retained in the schema JSON for compatibility but is never read.

## UNIQUE

`UNIQUE` is enforced, but through validating scans rather than a durable uniqueness claim:

- `CREATE UNIQUE INDEX` and inline/table-level `UNIQUE` constraints both materialize into a unique index definition.
- The core write paths (`INSERT`, `UPDATE`, `DELETE`, and their `ON CONFLICT`/`OR` variants) validate non-`NULL` values against the table's unique indexes before persisting, rejecting duplicates with `UNIQUE constraint failed`. Over the PostgreSQL wire protocol the rejection is SQLSTATE `23505`, and the message names the violated index.
- `CREATE UNIQUE INDEX` on a table that already contains duplicate non-`NULL` values is rejected and the index is not registered.
- `NULL` values are exempt — multiple `NULL`s are allowed, matching SQLite.
- Composite unique indexes are enforced, and integral numerics are canonicalized so `1` (integer) and `1.0` (real) collide the way SQLite's affinity does.

The implementation is scan-based: a table with a unique index serializes its core writes on the table gate so the validating scan cannot race another writer, and multi-row DML against such a table runs in an implicit transaction for statement-level atomicity. This is **not** full SQLite or PostgreSQL concurrency semantics, and DDL remains non-transactional. See [Indexes](/engine/indexes/) and [Compatibility](/sql-reference/compatibility/).

Outside an explicit transaction a duplicate is rejected by the `INSERT`/`UPDATE` itself. Inside an explicit transaction, writes are buffered and the unique indexes are validated at **`COMMIT`**, so the offending statement can succeed and the `COMMIT` then fail. A failed `COMMIT` has already rolled the transaction back and leaves the session usable (the next statement starts a new implicit transaction).

The wire protocol reports a duplicate as SQLSTATE `23505` with the violated index name in the message. The managed HTTP query API reports HTTP `409` with `"code": "23505"` and the index name in `details.constraint`. `INSERT ... ON CONFLICT` and `INSERT OR IGNORE`/`REPLACE` remain the idempotent write shapes; a plain insert is not retry-safe by itself.

### Fresh schemas vs. existing tables

`UNIQUE` constraints are materialized into indexes **only when the table is created**. The effect applies to newly created tables, not retroactively:

- A table created now with `UNIQUE` (inline, table-level, or `CREATE UNIQUE INDEX`) is enforced from the start.
- A table created by an older engine build, whose `UNIQUE` declarations were silently discarded, is **not** magically enforced after an upgrade — nothing re-parses the old `CREATE TABLE` statement, so the constraint was never retained.
- After upgrading, re-issue `CREATE UNIQUE INDEX` for any column that must be unique on a pre-existing table; that path validates existing rows and rejects the index if duplicates are already present.

Do not assume an existing table's uniqueness is enforced just because the engine now supports `UNIQUE`.

## The rejected constraints

`CHECK` and `FOREIGN KEY` are **rejected at DDL** with SQLSTATE `0A000` instead of being accepted and discarded:

| Constraint | Status | What to do instead |
| --- | --- | --- |
| `CHECK (expr)` | Rejected at `CREATE TABLE` and `ALTER TABLE ADD COLUMN` | Validate in the application, or enforce through a unique/foreign-key-free design (a partial unique index is not available either). |
| `FOREIGN KEY ... REFERENCES ...` | Rejected, including inline `REFERENCES`, table-level `FOREIGN KEY`, named constraints, and `ON DELETE`/`ON UPDATE` actions | Enforce referential integrity in the application; cascades are not implemented. |

This is deliberate: accepting the clause while never evaluating it made applications believe a constraint existed. A migration that carries `CHECK`/`FOREIGN KEY` from PostgreSQL or SQLite now fails loudly at the DDL statement and must be rewritten. Gogs and Vikunja declare neither clause; GoatCounter's retired schema does, so a fresh GoatCounter bootstrap is not supported on this engine build.

Constraints that remain accepted and enforced are `PRIMARY KEY` (single column), `NOT NULL`, `UNIQUE`/unique indexes, and constant `DEFAULT`s. Duplicate values are allowed in any other column.

## Why this matters for migrations

SQLite- and PostgreSQL-flavoured schemas often lean on `UNIQUE`, `CHECK`, and `FOREIGN KEY` for integrity. `UNIQUE` imports into enforced unique indexes, but `CHECK`/`FOREIGN KEY` are rejected. Rewrite those DDL statements and add application-level checks for anything that must stay referentially consistent before pointing a migrator at PizzaSQL.

See [Compatibility](/sql-reference/compatibility/) for the wider gap list, and [Indexes](/engine/indexes/) for how `CREATE INDEX`/`UNIQUE INDEX` actually behave at the storage layer.
