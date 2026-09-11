---
title: SQL at a glance
description: The PizzaSQL dialect in one page — what it is, what it supports, and where it deliberately differs from both SQLite and PostgreSQL.
---

PizzaSQL is a SQL engine with a hand-written lexer, parser, analyzer, and executor written in Go. It speaks a **SQLite-flavoured SQL dialect** but is served through a **PostgreSQL wire protocol**, which is why it "looks like Postgres" to your tools while behaving like SQLite under the hood.

This page is the short version. Each area has a dedicated page:

- [Data types](/sql-reference/data-types/) — SQLite-style type affinity, not strict column types.
- [Statements](/sql-reference/statements/) — the full statement grammar.
- [Expressions & operators](/sql-reference/expressions/) — operators, `CASE`, `IN`, `LIKE`, subqueries.
- [Functions](/sql-reference/functions/) — scalar and aggregate functions, and which ones are real.
- [Constraints](/sql-reference/constraints/) — what `PRIMARY KEY`, `UNIQUE`, and friends actually do here.
- [Compatibility](/sql-reference/compatibility/) — the gap list against SQLite and PostgreSQL.

## Dialect, in one sentence

SQLite syntax, PostgreSQL wire transport, SQLite's type system, and a storage engine that keeps each row as a versioned binary value in a key-value store.

## Statement support

```sql
-- Query
SELECT [DISTINCT] cols FROM table [WHERE ...] [GROUP BY ...] [HAVING ...]
       [ORDER BY ...] [LIMIT n] [OFFSET n];

-- Write
INSERT INTO t (cols) VALUES (...), (...);
INSERT INTO t SELECT ...;
INSERT OR REPLACE/IGNORE/FAIL/ABORT INTO t ...;
INSERT INTO t ... ON CONFLICT (pk) DO NOTHING | DO UPDATE SET c = v, ...;
UPDATE t SET c = v, ... WHERE ...;
DELETE FROM t WHERE ...;

-- Schema
CREATE TABLE t (col TYPE constraints, ...);
CREATE INDEX idx ON t (col);
CREATE UNIQUE INDEX idx ON t (col);
CREATE VIEW v AS SELECT ...;
DROP TABLE t; DROP INDEX idx; DROP VIEW v;
ALTER TABLE t ADD COLUMN c TYPE;
ALTER TABLE t DROP COLUMN c;
ALTER TABLE t RENAME TO new_name;
ALTER TABLE t RENAME COLUMN old TO new;

-- Transactions (see the caveats below)
BEGIN; COMMIT; ROLLBACK; SAVEPOINT s; RELEASE s; ROLLBACK TO s;

-- Introspection
PRAGMA table_info(t); PRAGMA table_list; PRAGMA database_list; PRAGMA version;
EXPLAIN ...; EXPLAIN QUERY PLAN ...;
```

## What is *not* supported

PizzaSQL is intentionally small. These features are not implemented at all — they will be rejected by the parser, not silently mishandled:

- **Window functions** — only `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)`; other window functions and frame clauses are not implemented.
- **`RETURNING`** — `INSERT`/`UPDATE`/`DELETE` do not return rows.
- **`WITHOUT ROWID`** tables.
- **Triggers**, **stored procedures**, **prepared SQL in the engine** (the PG driver handles parameters client-side).
- **`GLOB`** — the keyword exists but is not wired up as an operator; `x GLOB 'a*'` is a parse error.

A second group of features *parses* but has no effect or is only partially implemented. These are the sharp edges:

- `RIGHT JOIN` and `FULL [OUTER] JOIN` parse but return an empty result — they are not executed. Use `LEFT JOIN` and reorder.
- `NATURAL JOIN` and `USING (cols)` parse but the condition is ignored.
- `UNIQUE`, `CHECK`, and `FOREIGN KEY` constraints parse but are **not enforced** (see [Constraints](/sql-reference/constraints/)).
- `AUTOINCREMENT` parses but has **no behaviour** beyond ordinary `INTEGER PRIMARY KEY` rowid generation.
- `LIKE ... ESCAPE 'x'` — the `ESCAPE` clause is parsed and ignored.

For the full, honest list, see [Compatibility](/sql-reference/compatibility/).

## The engine vs. the managed service

One distinction matters throughout these docs. **PizzaSQL**, the engine, has raw limits — its parser, executor, and storage. The **managed database.pizza** service wraps that engine in an API-key-authenticated proxy that adds its own rules on top, including scope enforcement and rejecting transaction statements on the HTTP endpoint.

Where a behaviour differs between the two, the relevant page calls it out explicitly. In short:

| Concern | Raw PizzaSQL | Managed database.pizza |
| --- | --- | --- |
| Transactions | `BEGIN`/`COMMIT`/`ROLLBACK` work over PG wire and the engine's own HTTP API | PG wire proxy forwards them; the managed HTTP query endpoint rejects transaction statements |
| Auth | None (`-http-auth`/API keys optional) | API keys required, scoped per operation |
| Schema features | SQLite-style, no schemas/roles | Same, plus per-organization/database isolation |

## Placeholders

Pass values as parameters rather than concatenating them into SQL:

- Over the **managed HTTP API**, use `?` placeholders with a `params` array: `{"sql": "SELECT * FROM t WHERE id = ?", "params": [42]}`.
- Over the **PostgreSQL wire protocol**, use `$1`, `$2`, … (PostgreSQL style) — drivers bind these for you.

## Conventions used in these docs

- `INTEGER`, `TEXT`, etc. are written in uppercase for clarity; the parser is case-insensitive for keywords and identifiers.
- Tables and databases are named by example: organization `acme`, database `production`.
- Anything marked **unsafe** or **not enforced** is a real behavioural gap, not a documentation convenience.
