---
title: Constraints
description: What PRIMARY KEY, NOT NULL, DEFAULT, UNIQUE, CHECK, and FOREIGN KEY actually do in PizzaSQL — and which ones are rejected.
---

Constraints in PizzaSQL fall into two camps: the ones that are actually implemented, and the ones that merely parse. This page is deliberately blunt about the difference, because silently assuming a constraint is enforced will corrupt data. `UNIQUE`, `CHECK`, and `FOREIGN KEY` are enforced on the core write paths, with caveats described below.

## The enforced constraints

### PRIMARY KEY

- A single column can be `PRIMARY KEY`. A table-level `PRIMARY KEY (col)` is also accepted.
- A table-level composite `PRIMARY KEY (a, b)` is supported. Key columns are implicitly `NOT NULL`, so a missing or NULL component fails with `23502` instead of auto-assigning a rowid. The key is encoded in column order and used by `INSERT`, full-key `SELECT`/`UPDATE`/`DELETE`, `ON CONFLICT (a, b)`, and duplicate detection (`23505`); a predicate on only the first key column is a scan, not a point lookup. A composite key gets a hidden rowid rather than an `INTEGER PRIMARY KEY` alias. `ALTER TABLE ... ADD COLUMN ... PRIMARY KEY`, a generated column in a primary key, and assigning a key column in `ON CONFLICT ... DO UPDATE` are rejected with `0A000`.
- An **`INTEGER PRIMARY KEY`** column becomes an alias for the implicit rowid. Inserting without a value auto-assigns the next rowid; inserting with a value sets the rowid and advances the counter past it.
- A **non-integer primary key** (e.g. `TEXT PRIMARY KEY`) is a normal column with a separate hidden rowid counter.
- The primary key and unique indexes drive **duplicate detection** on `INSERT`, and therefore `INSERT OR REPLACE`/`OR IGNORE` and `ON CONFLICT DO NOTHING`/`DO UPDATE`. `ON CONFLICT` targets a primary key or unique-index column list.
- Without any declared primary key, the engine assigns a synthetic `_rowid_` primary key, so duplicate and NULL values are allowed in user columns.

### NOT NULL

- Current source builds validate the final row on `INSERT`, bulk insert, `UPDATE`, and upsert, including transaction overlays. A violation is SQLSTATE `23502` over the PostgreSQL wire protocol.
- Omitting a column applies its constant default, if any. Explicit `NULL` does **not** select that default and is rejected for a `NOT NULL` column.
- Validation happens after defaults and assignments. A failed multi-row statement leaves no partial statement effects; earlier successful statements in an explicit transaction remain staged until commit or rollback.
- `NOT NULL` does not enforce a PostgreSQL-style strict column type. Older tenant builds had gaps in defaulted inserts and updates; check the engine build/capabilities rather than assuming an app deployment upgraded the engine.

### DEFAULT

- `DEFAULT expr` accepts constants and the write-time clock expressions `CURRENT_TIMESTAMP`, `CURRENT_DATE`, `CURRENT_TIME`, `datetime('now')`, `date('now')`, and `time('now')`, with or without parentheses.
- A constant default is evaluated at DDL time and stored as its value. A clock default is stored as SQL text and evaluated **once per statement at write time**, so it is never frozen at DDL time: two inserts get different values, while a multi-row insert shares one. An explicit `NULL` still wins over the default.
- Any other non-constant default (`lower('X')`, `random()`, a column reference, a subquery) is rejected at DDL with SQLSTATE `0A000`.
- On `ADD COLUMN`, a constant default backfills existing rows with that value, and a clock default is evaluated once for the statement and written to every existing row. `NOT NULL` without a default on a non-empty table fails with `23502`; `UNIQUE` fails with `23505`; `CHECK` fails with `23514`. See [ALTER TABLE](/sql-reference/statements/#alter-table).

### AUTOINCREMENT

- `AUTOINCREMENT` **parses but has no behaviour**. It does not prevent rowid reuse, does not maintain a separate sequence, and behaves exactly like a plain `INTEGER PRIMARY KEY`.
- It is retained in the schema JSON for compatibility but is never read.

## UNIQUE

Current source builds enforce `UNIQUE` under the table publication gate. Column-based indexes use rebuildable ownership caches after a durable scan; expression indexes still validate by scanning. This is not a native durable uniqueness-index page structure:

- `CREATE UNIQUE INDEX` and inline/table-level `UNIQUE` constraints both materialize into a unique index definition.
- The core write paths (`INSERT`, `UPDATE`, `DELETE`, and their `ON CONFLICT`/`OR` variants) validate non-`NULL` values against the table's unique indexes before persisting, rejecting duplicates with `UNIQUE constraint failed`. Over the PostgreSQL wire protocol the rejection is SQLSTATE `23505`, and the message names the violated index.
- `CREATE UNIQUE INDEX` on a table that already contains duplicate non-`NULL` values is rejected and the index is not registered.
- `NULL` values are exempt — multiple `NULL`s are allowed, matching SQLite.
- Composite unique indexes are enforced, and integral numerics are canonicalized so `1` (integer) and `1.0` (real) collide the way SQLite's affinity does.

A table with a unique index serializes its core writes on the table gate, and validation sees the final transaction overlay. Current source builds cache column-based UNIQUE ownership after an initial durable scan and publish ownership deltas only after successful commit. Expression UNIQUE indexes retain scan validation until evaluator determinism is proven. Scan-based `UPDATE`/`DELETE`, primary-key moves, and DML with `RETURNING` use a statement-level atomic boundary whether or not the table has a unique index. This is **not** full SQLite or PostgreSQL concurrency semantics, and DDL remains non-transactional. See [Indexes](/engine/indexes/) and [Compatibility](/sql-reference/compatibility/).

Outside an explicit transaction a duplicate is rejected by the `INSERT`/`UPDATE` itself. Inside an explicit transaction, writes are buffered and the unique indexes are validated at **`COMMIT`**, so the offending statement can succeed and the `COMMIT` then fail. A failed `COMMIT` has already rolled the transaction back and leaves the session usable (the next statement starts a new implicit transaction).

The wire protocol reports a duplicate as SQLSTATE `23505` with the violated index name in the message. The managed HTTP query API reports HTTP `409` with `"code": "23505"` and the index name in `details.constraint`. `INSERT ... ON CONFLICT` and `INSERT OR IGNORE`/`REPLACE` remain the idempotent write shapes; a plain insert is not retry-safe by itself.

### Fresh schemas vs. existing tables

`UNIQUE` constraints are materialized into indexes **only when the table is created**. The effect applies to newly created tables, not retroactively:

- A table created now with `UNIQUE` (inline, table-level, or `CREATE UNIQUE INDEX`) is enforced from the start.
- A table created by an older engine build, whose `UNIQUE` declarations were silently discarded, is **not** magically enforced after an upgrade — nothing re-parses the old `CREATE TABLE` statement, so the constraint was never retained.
- After upgrading, re-issue `CREATE UNIQUE INDEX` for any column that must be unique on a pre-existing table; that path validates existing rows and rejects the index if duplicates are already present.

Do not assume an existing table's uniqueness is enforced just because the engine now supports `UNIQUE`.

## CHECK and FOREIGN KEY

`CHECK` is accepted at `CREATE TABLE` and `ALTER TABLE ADD COLUMN`, inline or table-level, named or unnamed, and **enforced** on `INSERT`, multi-row `INSERT`, `UPDATE`, and `ON CONFLICT DO UPDATE`. A FALSE result is SQLSTATE `23514`; a NULL or unknown result passes (SQL three-valued logic).

Predicates are restricted to deterministic, subquery-free expressions over unqualified columns of the same row. Subqueries, aggregates, window functions, qualified references, and non-deterministic functions are rejected with `0A000`, as is an unknown column. Adding a `CHECK` to a populated table validates the existing rows (against declared defaults) and rejects the DDL if any row violates it. The constraint appears in `sqlite_master`/`sqlite_schema` table SQL; `pg_constraint` and `information_schema.check_constraints` are not emulated.

`FOREIGN KEY ... REFERENCES ...` is supported inline and table-level, including composite keys, named constraints, and self-references, and is **enforced** with SQLSTATE `23503` on child `INSERT`/`UPDATE` and parent `DELETE`/key `UPDATE`. The referenced parent columns must be the parent's `PRIMARY KEY` or covered by a `UNIQUE` index; otherwise the DDL is rejected. A composite key with any `NULL` component is not enforced (MATCH SIMPLE).

`ON DELETE` and `ON UPDATE` accept `CASCADE`, `SET NULL`, `SET DEFAULT`, `NO ACTION`, and `RESTRICT`. Cascades run transitively through grandchildren; `SET NULL` and `SET DEFAULT` must satisfy the child's `NOT NULL`, `CHECK`, and foreign-key rules, and any failure rolls back the whole operation. In autocommit the action is applied with the statement; inside an explicit transaction it is applied no later than `COMMIT`, and a `NO ACTION`/`RESTRICT` violation surfaces at `COMMIT`. `DEFERRABLE` is rejected with `0A000`. Cascading point DML costs O(FK component), not O(1), because it scans referencing tables and validates the connected component at commit.

Enforcement is always on: `PRAGMA foreign_keys` reports `1` and `OFF` is rejected. `ALTER TABLE ... ADD COLUMN ... REFERENCES` is rejected, and `DROP`/`RENAME` of a participating column or table is rejected. `PRAGMA foreign_key_list` and `pg_constraint` are not emulated.

## Why this matters for migrations

SQLite- and PostgreSQL-flavoured schemas often lean on `UNIQUE`, `CHECK`, and `FOREIGN KEY` for integrity. All three are now enforced on the core write paths, with the caveats above (parent must be unique, `DEFERRABLE` rejected, cascade failures roll back). The SQLite import path still skips `CHECK` and `FOREIGN KEY` clauses; recreate them after importing a `.db` file.

See [Compatibility](/sql-reference/compatibility/) for the wider gap list, and [Indexes](/engine/indexes/) for how `CREATE INDEX`/`UNIQUE INDEX` actually behave at the storage layer.
