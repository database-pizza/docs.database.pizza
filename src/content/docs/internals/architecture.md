---
title: Architecture
description: The PizzaSQL engine's components and how they connect — lexer, parser, analyzer, executor, and the PizzaKV storage backend.
---

PizzaSQL is a SQL database engine written from scratch in Go. It is a single process that can expose three front-ends, all backed by the same core.

## High-level view

```
client ──► PostgreSQL wire server ─┐
client ──► HTTP/JSON server ───────┼──► core ──► PizzaKV (key-value store)
client ──► CLI / REPL ─────────────┘
```

The core is a pipeline:

```
lexer ──► parser ──► analyzer ──► executor ──► storage
```

1. **Lexer** (`pkg/lexer`) tokenizes SQL into tokens (identifiers, numbers, strings, operators, and ~200 keywords).
2. **Parser** (`pkg/parser`) is a hand-written recursive-descent parser producing an abstract syntax tree (AST) of statements and expressions.
3. **Analyzer** (`pkg/analyzer`) performs semantic analysis: resolving table/column references against a catalog, type/affinity inference, and validating aggregate/`GROUP BY` placement.
4. **Executor** (`pkg/executor`) evaluates the AST against storage, producing a `Result` (columns + rows, or an affected-row count).
5. **Storage** (`pkg/storage`) maps SQL tables to key-value operations and speaks to PizzaKV.

## Front-ends

- **PostgreSQL wire server** (`pkg/pgserver`) implements a **partial** PostgreSQL protocol v3.0 (simple and extended query) so that some Postgres clients can connect.
- **HTTP/JSON server** (`pkg/httpserver`) exposes `POST /query`, batch `/execute`, schema introspection, import/export, health, and metrics endpoints.
- **CLI / REPL** (`main.go`) provides interactive and single-statement access, plus export/import modes.

All three construct an `Executor` bound to a database and route statements through the same pipeline, so behaviour is identical across access methods (modulo the transport-specific bits like the PG protocol's transaction state).

## The database manager

`pkg/storage`'s `DatabaseManager` maps a database name to a `DatabaseInstance`, which pairs a `SchemaManager` (schema/index definitions) with a `TableManager` (row data and index entries). Each database is an isolated namespace of keys in PizzaKV. Databases are created on first access (`autoCreate`).

On the managed database.pizza service, the *engine's* front-ends are internal; customers instead reach a proxy layer (an HTTP router and a PostgreSQL wire proxy) that authenticates API keys and routes to the right engine instance/namespace. See the home page's [managed API vs. engine](/).

## PizzaKV

PizzaKV is a separate key-value store (written in Zig) that PizzaSQL talks to over a Unix domain socket or TCP. It provides four operations the storage layer relies on:

- `write key value`
- `read key`
- `reads prefix` (all values under a key prefix)
- `delete key`

PizzaSQL opens a pool of connections to PizzaKV and serializes each SQL-level operation into one or more of these primitive commands. Rows are versioned binary values and schema/catalog objects are JSON documents under namespaced keys — the layout is described in [Storage model](/internals/storage/).

## Key design choices and their consequences

- **Row storage**: rows are encoded with a versioned binary codec (legacy JSON fallback), which keeps the engine simple and flexible but means full scans decode the entire table. The dominant cost of a full scan is row decoding, not the key-value read.
- **Hand-written parser**: no parser generator; the grammar is explicit and limited. CTEs and `ROW_NUMBER()` are supported, but many PostgreSQL constructs are absent by design.
- **SQLite affinity**: dynamic typing rather than a strict type system (see [Data types](/sql-reference/data-types/)).
- **No planner**: index use is a single heuristic, not a cost-based decision (see [Query lifecycle](/internals/query-lifecycle/)).

For the front-ends in detail, see [PostgreSQL protocol](/internals/postgres-protocol/). For how a statement flows through the pipeline, see [Query lifecycle](/internals/query-lifecycle/).
