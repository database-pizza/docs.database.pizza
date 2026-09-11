---
title: Indexes
description: How CREATE INDEX works, what persists, what is rebuilt in memory, and the narrow conditions under which an index is actually used.
---

PizzaSQL has secondary indexes, but they are much simpler than in a typical database. The most important fact first: **index definitions persist, but index entries live only in memory and are rebuilt on demand**. Selection is also limited to a single case: a single-column equality predicate.

## Creating and dropping indexes

```sql
CREATE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx ON t(col);
DROP INDEX idx_users_email;
DROP INDEX IF EXISTS idx_users_email;
```

- `CREATE INDEX` verifies the table and every column exist before creating the index.
- The index definition (name, table, columns, `unique` flag, `DESC` flags) is written to the key-value store, so it survives restarts and is visible to other connections.
- `CREATE INDEX` also builds in-memory entries for the rows that already exist at creation time. If that build fails, the index definition is rolled back.
- `DROP TABLE` drops the table's indexes automatically.
- Multi-column indexes (`(a, b)`) and `DESC` ordering are accepted and stored, but they do not affect how the index is *used* (see below).

## What persists vs. what is rebuilt

| Aspect | Persisted? |
| --- | --- |
| Index definition (name, table, columns, unique) | yes, in the KV store |
| Index entries (value → rowids) | **no** — held in memory only |

In practice this means:

- After an engine restart, an index has no entries until a query triggers a lookup through it. At that point the engine scans the table and reconstructs the value→rowids mapping in memory (`ensureIndex`).
- Writes (`INSERT`/`UPDATE`/`DELETE`) keep an already-built in-memory index up to date incrementally, so a warm index stays correct without a rebuild.
- Because entries are derived from row data, a rebuild is always consistent with the table; the definition is the only durable state.

## When an index is used

Index lookup is attempted for a **single-table** `SELECT` whose `WHERE` clause is, exactly, `column = literal` (or `literal = column`). If the engine finds an index whose **sole column** matches (case-insensitively), it resolves the value to a set of rowids and returns those rows directly.

That is the entire optimization:

- ✅ `WHERE email = 'a@b.c'` with `CREATE INDEX idx ON users(email)` — uses the index.
- ✅ `WHERE email = ?` or `WHERE email = $1` — both managed transports bind parameters by rewriting them as literals before execution, so the resulting equality can use the index.
- ❌ `WHERE email = lower(x)` or any non-literal right-hand side.
- ❌ `WHERE age > 30`, `WHERE age BETWEEN ...`, `WHERE a = 1 AND b = 2` — range and composite conditions are not index-eligible.
- ❌ Multi-column indexes are never used by the selection logic, even for a leading-column equality.
- ❌ `ORDER BY` never uses an index for sorting.
- ❌ `UPDATE`/`DELETE`/`JOIN` predicates do not use the index for row selection.

If no index applies, the engine performs a **full table scan** (it reads every row and applies the filter). There is no cost-based planner deciding between scan and index — the decision is a single heuristic check.

## UNIQUE indexes

`CREATE UNIQUE INDEX` stores the `unique` flag in the definition (it appears in `pg_indexes` introspection) **and enforces it** on the core write paths via validating scans; creating one against a table with existing duplicate non-`NULL` values is rejected. `NULL` values are exempt, matching SQLite. See [Constraints](/sql-reference/constraints/).

## Interaction with the row cache

Table rows and index entries are cached in the running database manager and shared by executors for that database. Writes invalidate or update the relevant cache. An index lookup avoids re-reading the table once it is warm, but the first lookup after an engine restart still materializes the whole table to build the index.

## Best practices

- Create single-column indexes on columns used in equality predicates against literals — that is the only predicate shape that benefits.
- Do not bother with composite indexes for query acceleration; they are never used.
- Remember that entries are in-memory state. The first indexed query after an engine restart pays a full scan to build the index.
- Because there is no planner, adding an index never hurts correctness — but it only helps the one recognized predicate shape.
