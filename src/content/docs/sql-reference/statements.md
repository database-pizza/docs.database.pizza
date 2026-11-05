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
- **Row-locking clauses** support `FOR UPDATE` and `FOR SHARE` on a single base table, with `NOWAIT` (SQLSTATE `55P03`) and `SKIP LOCKED`. Locks last until `COMMIT`/`ROLLBACK` (or the end of an autocommit statement). A conflicting writer gets `40001` rather than blocking; there are no gap or predicate locks. `FOR NO KEY UPDATE`, `FOR KEY SHARE`, `OF`, and locking over joins, CTEs, aggregates, `DISTINCT`, or set operations are rejected with `0A000` (see [Concurrency](/engine/concurrency/)).
- **Array predicates** support `expr = ANY(array)`, `expr <> ALL(array)`, and containment (`arr @> arr`, `arr <@ arr`) with SQL three-valued logic, including bound parameters (`= ANY($1)`). Array literals (`'{a,b}'`, `ARRAY[1,2]`) and 1-based subscripts (`arr[1]`) are supported. Multidimensional arrays and scalar `unnest` are rejected with `0A000`; see [CREATE TABLE](#create-table) and [Functions](/sql-reference/functions/).
- **Set-returning functions** in `FROM` accept a column alias list: `unnest(arr) AS t(value)`, `jsonb_each(doc) AS t(key, value)`. A list with the wrong arity fails with `42P10`.

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
INSERT INTO table ... ON CONFLICT [(col, ...)] DO NOTHING;
INSERT INTO table ... ON CONFLICT [(col, ...)] DO UPDATE SET col = expr, ...;
INSERT INTO table ... RETURNING expr, ...;
```

- Omitting the column list targets all columns in declaration order.
- `INSERT INTO t (col) DEFAULT VALUES` is accepted, but the column list is ignored: every column receives its default. SQLite rejects this form with one column specified, so avoid it; use `INSERT INTO t DEFAULT VALUES` when all defaults are intended.
- `INSERT ... SELECT` bulk-inserts the materialized result.
- **Conflict handling** applies to the primary key and to unique indexes:
  - `INSERT OR IGNORE` silently skips rows that would violate a primary key or unique index.
  - `INSERT OR REPLACE` deletes the conflicting row and inserts the new one.
  - `INSERT OR FAIL`/`OR ABORT` abort on the first conflict.
  - `ON CONFLICT (target) DO NOTHING` / `DO UPDATE SET ...` accept a primary-key or unique-index column list; omit the list for any conflict. `excluded.column` refers to the value proposed by the INSERT.
- Auto-generated integer primary keys (and the implicit rowid) are assigned when no PK value is supplied. `SELECT last_insert_rowid()` returns the rowid of the most recent successful `INSERT` on this connection (see [Functions](/sql-reference/functions/)).
- `RETURNING expr, ...` returns the inserted rows (including generated keys and defaults) instead of a bare command tag.

## UPDATE and DELETE

```sql
UPDATE table SET col = expr, ... [WHERE condition] [RETURNING expr, ...];
DELETE FROM table [WHERE condition] [RETURNING expr, ...];
```

- Both evaluate the `WHERE` condition per row. `UPDATE` evaluates `SET` expressions against the row's current values, so `SET balance = balance + 100` works.
- Omitting `WHERE` affects every row.
- `RETURNING` returns the affected rows. `ORDER BY`/`LIMIT` on `UPDATE`/`DELETE` are not supported.

## CREATE TABLE

```sql
CREATE TABLE [IF NOT EXISTS] table (
  column TYPE [PRIMARY KEY] [NOT NULL] [DEFAULT expr] [AUTOINCREMENT],
  ...,
  [PRIMARY KEY (col)],
  [UNIQUE (col, ...)],
  [CHECK (expr)],
  [FOREIGN KEY (col) REFERENCES other (col)]
);
```

- `IF NOT EXISTS` silently succeeds if the table already exists.
- `PRIMARY KEY`, `NOT NULL`, and constant `DEFAULT`s have an effect; `AUTOINCREMENT` is accepted but adds no behavior. Inline and table-level `UNIQUE` constraints are materialized into unique indexes and enforced on the core write paths — see [Constraints](/sql-reference/constraints/).
- `CHECK` constraints are accepted (inline and table-level, named or unnamed) and enforced on writes with SQLSTATE `23514`; a NULL or unknown result passes. Predicates are restricted to deterministic, subquery-free expressions over unqualified columns. `FOREIGN KEY` is accepted inline and table-level (including composite and named constraints) and enforced with `23503`; the parent columns must be a primary key or unique index. `ON DELETE`/`ON UPDATE` accept `CASCADE`, `SET NULL`, `SET DEFAULT`, `NO ACTION`, and `RESTRICT`; `DEFERRABLE` is rejected with `0A000`.
- A table-level composite `PRIMARY KEY (a, b)` is supported. Key columns are implicitly `NOT NULL`; a missing or NULL component fails with `23502`. `ALTER TABLE ... ADD COLUMN ... PRIMARY KEY`, a generated column in a primary key, and assigning a key column in `ON CONFLICT ... DO UPDATE` are rejected with `0A000`.
- `DEFAULT expr` accepts constants and the clock expressions `CURRENT_TIMESTAMP`, `CURRENT_DATE`, `CURRENT_TIME`, `datetime('now')`, `date('now')`, and `time('now')`, with or without parentheses. Signed numeric literals (`DEFAULT -1`, `DEFAULT +5`, `DEFAULT (-7)`), strings, blobs, `NULL`, and boolean literals are also accepted. A constant is stored as its evaluated value; a clock default is stored as SQL text and evaluated once per statement at write time. Any other non-constant default (`DEFAULT lower('X')`, `random()`, a column reference) is rejected with `0A000`.
- A bare `NULL` column specifier is accepted as a no-op (columns are nullable by default); `NOT NULL` still applies whenever it appears.
- `AUTOINCREMENT` is accepted but has no extra behaviour over a plain `INTEGER PRIMARY KEY`.
- **Array column types** are supported for `TEXT[]`, `VARCHAR(n)[]`, `INTEGER[]`, `BIGINT[]`, `SMALLINT[]`, `BOOLEAN[]`, `REAL[]`, `DOUBLE PRECISION[]`, and `NUMERIC[]`. Values use PostgreSQL array text: `'{a,b}'`, `ARRAY[1,2]`, `'{NULL,"NULL"}'`, and casts such as `::INTEGER[]`. `NULL` and `'{}'` are distinct. Access is 1-based (`arr[1]`; out of range is `NULL`); `array_length(arr, 1)` and a single-FROM `unnest(arr)` are supported. Multidimensional arrays, other element types, and scalar `unnest` are rejected with `0A000`; array parameters accept both text and PostgreSQL binary formats for the supported element types. `NUMERIC` elements keep their exact text and compare numerically, but unique/index keys use the stored text, so `1.10` and `1.1` are distinct keys.
- **`JSONB` columns** are validated and canonicalized on write (sorted keys, last duplicate wins, normalized numbers) and report OID 3802 over the wire. `->`, `->>`, `#>`, `#>>`, `@>`, `<@`, `?`, `?|`, `?&`, `||`, `-`, `#-`, and the `jsonb_*` functions are supported; jsonpath (`jsonb_path_*`) and GIN indexes are rejected with `0A000`. `JSON`/`TEXT` columns keep the JSON1 behavior.

## ALTER TABLE

```sql
ALTER TABLE table ADD COLUMN column TYPE [constraints];
ALTER TABLE table DROP COLUMN column;
ALTER TABLE table RENAME TO new_name;
ALTER TABLE table RENAME COLUMN old TO new;
```

- `ADD COLUMN` with a `DEFAULT` **rewrites existing rows**: a constant is written as its value, and a clock default is evaluated once for the statement and written to every row. `ADD COLUMN` without a default stays metadata-only and existing rows read `NULL`. The rewrite holds the table gate for the duration, so its cost is proportional to table size. `NOT NULL` without a default is rejected on a non-empty table with `23502`; `UNIQUE` fails with `23505` on duplicates; a new `CHECK` fails with `23514` when an existing row or the backfilled default violates it.
- `ADD COLUMN IF NOT EXISTS column ...` is idempotent and is the supported shape for boot-time migrations. The check and schema append are serialized within one engine process, so concurrent runners on the same process do not duplicate the column. Separate engine processes do not coordinate; run schema migrations from a single runner.
- `DROP COLUMN` rewrites **every remaining row** to remove the field, so its cost is proportional to table size and it holds the table gate for the duration. It also leaves index metadata that references the dropped column untouched; drop those indexes first or recreate them afterwards. The primary-key column cannot be dropped.
- `RENAME COLUMN` rewrites every row key and rewrites the stored definitions of every plain-column index on the table (single, composite, unique) in one schema update, so `ON CONFLICT`, unique enforcement, and `index_info`/`sqlite_master` follow the new name. Index names are unchanged. A rename that an **expression index** depends on is rejected with `0A000` instead of silently leaving the expression stale: drop the index, rename the column, then recreate it. Views and generated-column SQL are still not rewritten. `RENAME TO` is schema-only.
- `ALTER TABLE ADD COLUMN ... DEFAULT expr` accepts the same constants and clock whitelist as `CREATE TABLE`. A constant backfills its value; a clock default is evaluated once for the `ALTER` statement and backfills every existing row.
- Inside an explicit transaction, DDL is transactional: statements are visible to that session, invisible to others until `COMMIT`, and reverted by `ROLLBACK` (including `ROLLBACK TO SAVEPOINT`). Autocommit DDL applies immediately. A transactional DDL commit publishes catalog and rows in one compare-batch; a `DROP`/`RENAME` above the batch limit fails early with a clear error.

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

- Transactions stage DML and DDL and use optimistic compare-and-batch validation at commit. They are not PostgreSQL MVCC. See [Transactions](/engine/transactions/).
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

These are rejected at parse time: `WITHOUT ROWID`, `TRUNCATE`, `UPSERT` (beyond the `OR`/`ON CONFLICT` forms), triggers, and `CREATE SCHEMA`/roles. Window functions other than `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)` are also rejected.
