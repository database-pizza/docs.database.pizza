---
title: Statements
description: Reference for every SQL statement PizzaSQL accepts — SELECT, INSERT, UPDATE, DELETE, DDL, transactions, and PRAGMA.
---

This page lists each statement family with its exact grammar, behaviour, and caveats. For expression details (operators, `CASE`, `IN`, subqueries) see [Expressions & operators](/sql-reference/expressions/).

## SELECT

```sql
SELECT [DISTINCT] column [AS alias], ...
FROM table [[AS] alias]
     [JOIN ...]
WHERE condition
GROUP BY expr, ...
HAVING condition
ORDER BY expr [ASC|DESC], ...
LIMIT n [OFFSET m];
```

- `SELECT` without `FROM` evaluates an expression (`SELECT 1 + 2`, `SELECT upper('hi')`).
- `DISTINCT` de-duplicates the result row set.
- `ORDER BY` accepts expressions, column aliases, and 1-based ordinal positions (`ORDER BY 2`).
- `LIMIT`/`OFFSET` accept numeric expressions.
- **Set operations**: `UNION`, `UNION ALL`, `INTERSECT`, and `EXCEPT` are supported with standard precedence (`INTERSECT` binds tighter than `UNION`/`EXCEPT`). A compound query's `ORDER BY`/`LIMIT`/`OFFSET` apply to the combined result.
- **Subqueries** are supported in `FROM` (derived tables require an alias), as scalar expressions, in `IN (SELECT ...)`, and in `EXISTS (SELECT ...)`, including correlated subqueries.
- **Row-locking clauses are rejected.** `FOR UPDATE`, `FOR SHARE`, `FOR NO KEY UPDATE`, and the `NOWAIT`/`SKIP LOCKED` variants fail with SQLSTATE `0A000`. There are no row locks; use the optimistic transaction model and retry `40001` (see [Concurrency](/engine/concurrency/)).
- **Array predicates are rejected.** `expr = ANY(...)`, `expr <> ALL(...)`, and array literals fail with `0A000`; rewrite with `IN (?, ?, ...)` and individual parameters.

### Joins

```sql
FROM a JOIN b ON a.id = b.a_id
FROM a INNER JOIN b ON ...
FROM a LEFT [OUTER] JOIN b ON ...
FROM a CROSS JOIN b
FROM a, b            -- implicit cross join, filtered by WHERE
```

- `INNER`, `LEFT`, and `CROSS` joins are fully executed. `LEFT JOIN` produces a NULL-padded row for unmatched left rows.
- Equality joins (`ON a.x = b.y`) use a hash join; non-equality `ON` conditions fall back to a nested loop.
- **`RIGHT [OUTER] JOIN` and `FULL [OUTER] JOIN` parse but are not executed** — they return an empty result. Rewrite with `LEFT JOIN`.
- **`NATURAL JOIN` and `USING (cols)` parse but their join condition is ignored**, effectively becoming a cross join. Always use an explicit `ON`.

## INSERT

```sql
INSERT INTO table [(col, ...)] VALUES (expr, ...), (expr, ...);
INSERT INTO table [(col, ...)] SELECT ...;
INSERT OR REPLACE INTO table ...;
INSERT OR IGNORE INTO table ...;
INSERT OR FAIL INTO table ...;
INSERT OR ABORT INTO table ...;
INSERT INTO table ... ON CONFLICT [(pk)] DO NOTHING;
INSERT INTO table ... ON CONFLICT [(pk)] DO UPDATE SET col = expr, ...;
```

- Omitting the column list targets all columns in declaration order.
- `INSERT ... SELECT` bulk-inserts the materialized result.
- **Conflict handling** is driven by the primary key only:
  - `INSERT OR IGNORE` silently skips duplicate-PK rows.
  - `INSERT OR REPLACE` deletes the conflicting row and inserts the new one.
  - `INSERT OR FAIL`/`OR ABORT` abort on the first duplicate.
  - `ON CONFLICT (target) DO NOTHING` / `DO UPDATE SET ...` work only when the conflict is on the primary key; the `(target)` list must name the PK column (or be omitted).
- Auto-generated integer primary keys (and the implicit rowid) are assigned when no PK value is supplied. There is **no `RETURNING`**, but `SELECT last_insert_rowid()` returns the rowid of the most recent successful `INSERT` on this connection (see [Functions](/sql-reference/functions/)).

## UPDATE and DELETE

```sql
UPDATE table SET col = expr, ... WHERE condition;
DELETE FROM table WHERE condition;
```

- Both evaluate the `WHERE` condition per row. `UPDATE` evaluates `SET` expressions against the row's current values, so `SET balance = balance + 100` works.
- Omitting `WHERE` affects every row.
- No `RETURNING`, no `ORDER BY`/`LIMIT` on `UPDATE`/`DELETE`.

## CREATE TABLE

```sql
CREATE TABLE [IF NOT EXISTS] table (
  column TYPE [PRIMARY KEY] [NOT NULL] [DEFAULT expr] [AUTOINCREMENT],
  ...,
  [PRIMARY KEY (col, ...)],
  [UNIQUE (col, ...)],
  [CHECK (expr)],
  [FOREIGN KEY (col) REFERENCES other (col)]
);
```

- `IF NOT EXISTS` silently succeeds if the table already exists.
- `PRIMARY KEY`, `NOT NULL`, and constant `DEFAULT`s have an effect; `AUTOINCREMENT` is accepted but adds no behavior. Inline and table-level `UNIQUE` constraints are materialized into unique indexes and enforced on the core write paths — see [Constraints](/sql-reference/constraints/).
- `CHECK` and `FOREIGN KEY` are rejected at DDL with SQLSTATE `0A000` (inline and table-level, including named constraints and referential actions). They are not silently discarded; enforce those rules in the application.
- A table-level `PRIMARY KEY (a, b)` uses the first named column as the primary key; composite keys are not truly supported.
- `DEFAULT expr` is evaluated when the table is created, so it must be a constant expression and is stored as the evaluated value. Signed numeric literals (`DEFAULT -1`, `DEFAULT +5`, `DEFAULT (-7)`), strings, blobs, `NULL`, and boolean literals are accepted. A non-constant default such as `DEFAULT CURRENT_TIMESTAMP`, `DEFAULT datetime('now')`, or `DEFAULT lower('X')` is rejected at DDL with SQLSTATE `0A000` rather than being frozen at table-creation time. There is no per-row default evaluation; supply the value on `INSERT` instead.
- A bare `NULL` column specifier is accepted as a no-op (columns are nullable by default); `NOT NULL` still applies whenever it appears.
- `AUTOINCREMENT` is accepted but has no extra behaviour over a plain `INTEGER PRIMARY KEY`.

## ALTER TABLE

```sql
ALTER TABLE table ADD COLUMN column TYPE [constraints];
ALTER TABLE table DROP COLUMN column;
ALTER TABLE table RENAME TO new_name;
ALTER TABLE table RENAME COLUMN old TO new;
```

- `ADD COLUMN` appends schema metadata only. **Existing rows are not rewritten or backfilled**: they read `NULL` for the new column even when it declares `NOT NULL` or a `DEFAULT`. The declared default applies only to later `INSERT`s that omit the column. If you need a value on existing rows, run an explicit `UPDATE`.
- `ADD COLUMN IF NOT EXISTS column ...` is idempotent and is the supported shape for boot-time migrations. The check and schema append are serialized within one engine process, so concurrent runners on the same process do not duplicate the column. Separate engine processes do not coordinate; run schema migrations from a single runner.
- `DROP COLUMN` rewrites **every remaining row** to remove the field, so its cost is proportional to table size and it holds the table gate for the duration. It also leaves index metadata that references the dropped column untouched; drop those indexes first or recreate them afterwards. The primary-key column cannot be dropped.
- `RENAME COLUMN` rewrites every row key and does not update index metadata, expression indexes, views, or generated-column SQL that mention the old name. Drop and recreate affected indexes after a rename. `RENAME TO` is schema-only.
- `ALTER TABLE ADD COLUMN ... DEFAULT expr` follows the same constant-only rule as `CREATE TABLE`: a non-constant default is rejected with `0A000`, and even a constant default does not backfill existing rows.
- DDL is not transactional and is not rolled back by `ROLLBACK`; a failed multi-step migration must be repaired explicitly.

## CREATE / DROP INDEX and VIEW

```sql
CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON table (col [ASC|DESC], ...);
DROP INDEX [IF EXISTS] name;

CREATE VIEW [IF NOT EXISTS] view AS SELECT ...;
DROP VIEW [IF EXISTS] view;
```

- Index definitions persist, but index entries are rebuilt in memory and only used for single-column equality lookups — see [Indexes](/engine/indexes/).
- `UNIQUE` indexes are recorded as unique in the catalog **and enforced** on the core write paths via validating scans; `CREATE UNIQUE INDEX` rejects a table that already contains duplicate non-`NULL` values.
- Views are **connection-local and in-memory**: they exist only within the connection that created them and are not persisted or shared. See [Catalog & schema](/internals/catalog/).

## Transactions

```sql
BEGIN [TRANSACTION];
COMMIT;
ROLLBACK;
SAVEPOINT name;
RELEASE name;
ROLLBACK TO name;
```

- Transactions stage DML and use optimistic compare-and-batch validation at commit. They are not PostgreSQL MVCC, and DDL is not transactional. See [Transactions](/engine/transactions/).
- `SAVEPOINT` outside a transaction implicitly starts one.
- On the **managed HTTP endpoint**, transaction statements are rejected with `501`. Over the **PostgreSQL wire proxy**, transactions are forwarded and work normally.

## PRAGMA and EXPLAIN

```sql
PRAGMA table_info(t);      -- column list for table t
PRAGMA table_xinfo(t);     -- table_info columns plus a trailing hidden flag
PRAGMA index_list(t);      -- indexes on table t (seq, name, unique, origin, partial)
PRAGMA index_info(idx);    -- columns of index idx (seqno, cid, name)
PRAGMA table_list;         -- all tables
PRAGMA database_list;      -- attached databases
PRAGMA version;            -- engine version

EXPLAIN stmt;              -- simplified opcode listing
EXPLAIN QUERY PLAN stmt;   -- SCAN/FILTER/SORT/LIMIT description
```

- `table_xinfo`, `index_list`, and `index_info` exist to satisfy SQLite migrators (GORM/XORM); they are answered from the durable schema, not a real SQLite file.
- Only the `PRAGMA` forms above are implemented; any other pragma name errors.
- `EXPLAIN` output is **illustrative only** — it does not reflect the real execution engine (there is no cost-based planner; see [Query lifecycle](/internals/query-lifecycle/)).

## SQLite catalog tables

`sqlite_master` and `sqlite_schema` are emulated as **read-only** virtual tables whose rows are synthesized from the durable schema (`type`, `name`, `tbl_name`, `rootpage`, `sql`). Single-table `SELECT` queries against them work for migrator introspection; they are not real writable SQLite catalog tables and are not persisted. See [PostgreSQL protocol](/internals/postgres-protocol/).

## ATTACH / DETACH DATABASE

```sql
ATTACH DATABASE 'name' AS alias;
DETACH DATABASE alias;
```

- `ATTACH` registers another database namespace (each database is a key prefix in PizzaKV) under an alias. Aliases `main`, `temp`, and `temporary` are reserved.
- `DETACH` cannot detach `main`. Detaching does not drop the underlying database data.

## Not supported

These are rejected at parse time: `RETURNING`, `WITHOUT ROWID`, `TRUNCATE`, `UPSERT` (beyond the `OR`/`ON CONFLICT` forms), triggers, and `CREATE SCHEMA`/roles. Window functions other than `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)` are also rejected.
