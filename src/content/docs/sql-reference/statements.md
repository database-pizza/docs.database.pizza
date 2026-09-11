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
- `PRIMARY KEY`, `NOT NULL`, and `DEFAULT` have an effect; `AUTOINCREMENT` is accepted but adds no behavior. Inline and table-level `UNIQUE` constraints are materialized into unique indexes and enforced on the core write paths — see [Constraints](/sql-reference/constraints/). `CHECK` and `FOREIGN KEY` are still parsed and discarded.
- A table-level `PRIMARY KEY (a, b)` uses the first named column as the primary key; composite keys are not truly supported.
- `DEFAULT expr` is evaluated when the table is created, so it must be a constant expression. Signed numeric literals (`DEFAULT -1`, `DEFAULT +5`, `DEFAULT (-7)`) are accepted.
- A bare `NULL` column specifier is accepted as a no-op (columns are nullable by default); `NOT NULL` still applies whenever it appears.
- `AUTOINCREMENT` is accepted but has no extra behaviour over a plain `INTEGER PRIMARY KEY`.

## ALTER TABLE

```sql
ALTER TABLE table ADD COLUMN column TYPE [constraints];
ALTER TABLE table DROP COLUMN column;
ALTER TABLE table RENAME TO new_name;
ALTER TABLE table RENAME COLUMN old TO new;
```

- `ADD COLUMN` appends a nullable column; `ADD COLUMN IF NOT EXISTS column ...` is also accepted.
- You cannot drop the primary-key column.
- Renaming is schema-only; index definitions referencing renamed columns are **not** updated automatically.

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
