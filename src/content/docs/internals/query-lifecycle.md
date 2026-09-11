---
title: Query lifecycle
description: What happens between a SQL string and a result — parse, analyze, plan, execute, validate transactions, and return.
---

This page traces a single statement from bytes to result. It explains *why* certain queries are fast or slow, and where the engine's "planner" ends (early).

## 1. Lex and parse

The SQL string is tokenized and parsed into an AST. Both steps are pure and fail fast with a syntax error for anything the grammar doesn't cover (`RETURNING`, `WITHOUT ROWID`, triggers, etc.). A statement that parses is guaranteed to be one the engine at least *recognizes*, even if it later turns out to be only partially implemented.

Over the PostgreSQL protocol, a multi-statement batch is parsed *in full before execution begins*, so an unsupported trailing statement doesn't leave earlier writes half-committed.

## 2. Transaction context

Ordinary statements execute against the shared database managers. Inside a transaction, the session also maintains a private overlay of staged writes and deletes:

- Reads consult the overlay before durable storage, providing read-your-writes behavior.
- Reads record observed row versions and table or predicate generations.
- DML stays staged until `COMMIT` submits comparisons and writes as one batch.

No database-wide transaction lock is held for the life of the transaction. Other sessions can continue working; conflicting observations are detected at commit. See [Concurrency](/engine/concurrency/).

## 3. Analysis (semantic)

The `Analyzer` walks the AST against an in-memory **catalog** of tables and columns:

- Resolves `FROM` tables (including derived tables and joins) and verifies they exist.
- Resolves column references and rejects unknown or ambiguous columns.
- Infers types using SQLite affinity rules.
- Validates aggregate/`GROUP BY`/`HAVING` placement (e.g. aggregates are not allowed in `WHERE`, `SELECT *` is not allowed in an aggregate query without `GROUP BY`).
- Checks `INSERT` value counts and type compatibility.

The catalog is a per-executor cache. If schema changed through another path, the executor detects a schema-version mismatch, resyncs the catalog from storage, and retries once before returning a not-found error.

## 4. "Planning"

There is **no cost-based planner**. For a `SELECT`, the executor makes at most two decisions:

1. **Constant `WHERE`**: if the `WHERE` clause references no columns, it's evaluated once; a constant-false clause short-circuits to an empty result.
2. **Index eligibility**: if the `WHERE` is exactly `column = literal` (single table, no join), and an index exists whose only column matches, the engine does an index lookup. Otherwise it does a full table scan with a row filter.

That's it. There is no join-order optimization, no statistics, no range/partial-index support, and no `ORDER BY` via index. `EXPLAIN`/`EXPLAIN QUERY PLAN` output is illustrative, not derived from this decision process.

## 5. Execution

The executor evaluates the statement:

- **`SELECT`** loads rows (index lookup or full scan), applies the `WHERE` filter, resolves joins, applies `GROUP BY`/aggregation, `HAVING`, `ORDER BY`, `LIMIT`/`OFFSET`, and `DISTINCT`, then projects the select columns. A fast path uses running accumulators for simple `GROUP BY` aggregates; otherwise full per-group rows are collected.
- **`INSERT`** evaluates expressions, assigns rowids/auto keys, checks the primary key for duplicates, applies conflict handling (`OR REPLACE`/`IGNORE`, `ON CONFLICT`), and writes rows (concurrently for `INSERT ... SELECT`).
- **`UPDATE`/`DELETE`** select matching rows, evaluate `SET` expressions per row (so self-referencing updates work), and write back.
- **DDL** mutates the schema/index catalog and, for tables, truncates/creates storage.

If inside a transaction, `INSERT`/`UPDATE`/`DELETE` append undo-log entries as they run.

## 6. Result assembly

The executor returns a `Result`: a column list, a set of typed row values, an affected-row count, and (for inserts) a last-insert id field (currently always zero — auto-generated ids are not surfaced back; see [Functions](/sql-reference/functions/)).

The front-end then serializes this into its transport format:

- **PostgreSQL**: `RowDescription` + `DataRow` frames, then a `CommandComplete` tag; column types are mapped to a small set of PostgreSQL OIDs.
- **HTTP**: JSON with `columns` (name + inferred type) and `rows`.

## Where latency goes

For full-scan queries, the dominant cost is **decoding the whole table** into Go rows, not the key-value reads themselves. Indexed single-column equality lookups skip that and resolve value→rowids directly, which is why they are dramatically faster. Cold caches (fresh connection or restart) also pay a full table read on first access. See [Storage model](/internals/storage/) and [Indexes](/engine/indexes/).
