---
title: Catalog & schema
description: How PizzaSQL tracks tables, columns, and indexes — the in-memory catalog, the schema cache, and how they stay in sync.
---

"Catalog" in PizzaSQL refers to two related but distinct things: the **durable schema** in PizzaKV, and the **in-memory analyzer catalog** used to resolve names during queries. This page explains both and how they synchronize.

## The durable schema

Table and index definitions live in PizzaKV under the key scheme described in [Storage model](/internals/storage/):

- A table's schema (name, columns, primary key, `NextRowID`, `AutoIncrement`) is a JSON document at `<db>:_schema:<table>`.
- The list of tables is a JSON array at `<db>:_sys:tables`.
- Each index's definition is at `<db>:index:<name>`, with the list at `<db>:indexes`.

A `Schema` contains, for each column: name, declared type (the raw string), nullability, a `Default`, and a `PrimaryKey` flag. The declared type string is preserved verbatim; affinity is computed from it at analysis time (see [Data types](/sql-reference/data-types/)).

## The in-memory catalog

Each `Executor` holds an `analyzer.Catalog`: a map of table name → `TableInfo` (columns, types, primary-key flag, view flag). This is what the [Analyzer](/internals/architecture/) reads during semantic analysis to resolve tables and columns. It is not shared across executors — it's rebuilt per executor.

The catalog is populated from the durable schema by `SyncCatalog()`:

1. List tables from storage.
2. For each, read the schema, drop any stale catalog entry, and create a fresh `TableInfo`.
3. Remove catalog entries for tables that no longer exist.

Views are also registered in the catalog (marked `IsView`), which makes the analyzer accept `SELECT ... FROM view` even though the view body lives only in the executor's in-memory view registry.

## Synchronization

Because each executor keeps its own catalog, changes made through one path must propagate. The synchronization mechanism:

- The `SchemaManager` keeps a monotonically increasing **version counter**, bumped on every schema/index change.
- Before analysis, the executor checks whether its cached catalog version matches the `SchemaManager`'s version. If not, it calls `SyncCatalog()`.
- If analysis fails with a table/column-not-found error, the executor resyncs once and retries, to recover from schema changed through a different executor/API.

This means concurrent DDL and DML from different connections eventually converge, but there can be a brief window where a fresh executor hasn't yet observed a schema change.

## What the catalog does *not* store

The catalog is deliberately minimal:

- It does **not** store `CHECK` or `FOREIGN KEY` constraints — those are discarded at `CREATE TABLE`. `UNIQUE` constraints are materialized into unique index definitions (see [Constraints](/sql-reference/constraints/)).
- It does not store index definitions (those live in the `SchemaManager`/storage, not the analyzer catalog).
- It does not store statistics, histograms, or anything a cost-based planner would use — there is no planner.

## Views are connection-local

`CREATE VIEW` registers the view only in the creating executor's in-memory registry and catalog. Views are **not** persisted to PizzaKV and are not visible to other connections. When a query references a view, the executor transparently rewrites the `FROM` reference into the view's stored `SELECT` AST as a derived table. `DROP VIEW` removes it from that executor only. There is no cross-connection view sharing.

## Multi-database and ATTACH

The `DatabaseManager` maps database names to `DatabaseInstance`s, each with its own `SchemaManager` and `TableManager`. `ATTACH DATABASE 'name' AS alias` registers another database's namespace under an alias and adds its tables to the catalog with a `<alias>.<table>` prefix, so cross-database references resolve. `DETACH` removes the alias but does not drop the data. The `main` alias is always the primary database and cannot be detached.

## Schema operations

`SchemaManager` methods mutate the durable schema and the cache atomically under a lock, and bump the version counter so other executors resync. `CREATE TABLE`, `ALTER TABLE` (add/drop/rename column, rename table), `RENAME COLUMN`, and index operations all funnel through here. Renaming a column updates the schema's `PrimaryKey` reference if it matched, but does **not** rewrite index definitions that referenced the old column name.
