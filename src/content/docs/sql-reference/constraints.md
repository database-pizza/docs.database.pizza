---
title: Constraints
description: What PRIMARY KEY, NOT NULL, DEFAULT, UNIQUE, CHECK, and FOREIGN KEY actually do in PizzaSQL — and which ones are not enforced.
---

Constraints in PizzaSQL fall into two camps: the ones that are actually implemented, and the ones that merely parse. This page is deliberately blunt about the difference, because silently assuming a `CHECK` or `FOREIGN KEY` constraint is enforced will corrupt data. `UNIQUE` is now enforced on the core write paths, with caveats described below.

## The enforced constraints

### PRIMARY KEY

- A single column can be `PRIMARY KEY`, or a table-level `PRIMARY KEY (col, ...)`.
- A table-level composite key uses **only the first named column** as the effective primary key; true composite keys are not supported.
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

### AUTOINCREMENT

- `AUTOINCREMENT` **parses but has no behaviour**. It does not prevent rowid reuse, does not maintain a separate sequence, and behaves exactly like a plain `INTEGER PRIMARY KEY`.
- It is retained in the schema JSON for compatibility but is never read.

## UNIQUE

`UNIQUE` is enforced, but through validating scans rather than a durable uniqueness claim:

- `CREATE UNIQUE INDEX` and inline/table-level `UNIQUE` constraints both materialize into a unique index definition.
- The core write paths (`INSERT`, `UPDATE`, `DELETE`, and their `ON CONFLICT`/`OR` variants) validate non-`NULL` values against the table's unique indexes before persisting, rejecting duplicates with `UNIQUE constraint failed`.
- `CREATE UNIQUE INDEX` on a table that already contains duplicate non-`NULL` values is rejected and the index is not registered.
- `NULL` values are exempt — multiple `NULL`s are allowed, matching SQLite.
- Composite unique indexes are enforced, and integral numerics are canonicalized so `1` (integer) and `1.0` (real) collide the way SQLite's affinity does.

The implementation is scan-based: a table with a unique index serializes its core writes on the table gate so the validating scan cannot race another writer, and multi-row DML against such a table runs in an implicit transaction for statement-level atomicity. This is **not** full SQLite or PostgreSQL concurrency semantics, and DDL remains non-transactional. See [Indexes](/engine/indexes/) and [Compatibility](/sql-reference/compatibility/).

### Fresh schemas vs. existing tables

`UNIQUE` constraints are materialized into indexes **only when the table is created**. The effect applies to newly created tables, not retroactively:

- A table created now with `UNIQUE` (inline, table-level, or `CREATE UNIQUE INDEX`) is enforced from the start.
- A table created by an older engine build, whose `UNIQUE` declarations were silently discarded, is **not** magically enforced after an upgrade — nothing re-parses the old `CREATE TABLE` statement, so the constraint was never retained.
- After upgrading, re-issue `CREATE UNIQUE INDEX` for any column that must be unique on a pre-existing table; that path validates existing rows and rejects the index if duplicates are already present.

Do not assume an existing table's uniqueness is enforced just because the engine now supports `UNIQUE`.

## The non-enforced constraints

These are accepted by the parser and then **silently discarded** — the schema does not store them and no code checks them:

| Constraint | Parsed? | Stored? | Enforced? |
| --- | --- | --- | --- |
| `CHECK (expr)` | yes | no | **no** |
| `FOREIGN KEY ... REFERENCES ...` | yes | no | **no** |

Consequences to internalize:

- Duplicate values are allowed in any column except the primary key and non-`NULL` unique-indexed columns.
- Foreign-key relationships are not validated; deleting a parent row does not cascade, restrict, or set null on children.
- `CHECK` constraints never run. `CREATE TABLE t (age INTEGER CHECK (age > 0))` happily accepts `-5`.

## Why this matters for migrations

SQLite-flavoured schemas often lean on `UNIQUE` and `FOREIGN KEY` for integrity. `UNIQUE` constraints now import into enforced unique indexes, but `FOREIGN KEY` is still **dropped silently** rather than erroring. Inspect the imported schema afterwards and add application-level checks for anything that must stay referentially consistent.

See [Compatibility](/sql-reference/compatibility/) for the wider gap list, and [Indexes](/engine/indexes/) for how `CREATE INDEX`/`UNIQUE INDEX` actually behave at the storage layer.
