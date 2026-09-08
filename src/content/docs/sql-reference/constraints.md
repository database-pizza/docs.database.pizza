---
title: Constraints
description: What PRIMARY KEY, NOT NULL, DEFAULT, UNIQUE, CHECK, and FOREIGN KEY actually do in PizzaSQL — and which ones are not enforced.
---

Constraints in PizzaSQL fall into two camps: the ones that are actually implemented, and the ones that merely parse. This page is deliberately blunt about the difference, because silently assuming a `UNIQUE` or `FOREIGN KEY` constraint is enforced will corrupt data.

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

## The non-enforced constraints

These are accepted by the parser and then **silently discarded** — the schema does not store them and no code checks them:

| Constraint | Parsed? | Stored? | Enforced? |
| --- | --- | --- | --- |
| `UNIQUE (col)` | yes | no | **no** |
| `UNIQUE` column constraint | yes | no | **no** |
| `CHECK (expr)` | yes | no | **no** |
| `FOREIGN KEY ... REFERENCES ...` | yes | no | **no** |
| `CREATE UNIQUE INDEX` | yes | definition stored | **no** |

Consequences to internalize:

- Duplicate values are allowed in any column except the primary key. If you need uniqueness, enforce it in your application.
- Foreign-key relationships are not validated; deleting a parent row does not cascade, restrict, or set null on children.
- `CHECK` constraints never run. `CREATE TABLE t (age INTEGER CHECK (age > 0))` happily accepts `-5`.
- `CREATE UNIQUE INDEX` records an index marked `unique` in the catalog (it shows up in `pg_indexes`), but the uniqueness flag is cosmetic — the index still only accelerates lookups and does not reject duplicates.

## Why this matters for migrations

SQLite-flavoured schemas often lean on `UNIQUE` and `FOREIGN KEY` for integrity. When importing such a schema (SQL dump or SQLite file), those constraints are **dropped silently** rather than erroring. Inspect the imported schema afterwards and add application-level checks for anything that must stay unique or referentially consistent.

See [Compatibility](/sql-reference/compatibility/) for the wider gap list, and [Indexes](/engine/indexes/) for how `CREATE INDEX`/`UNIQUE INDEX` actually behave at the storage layer.
