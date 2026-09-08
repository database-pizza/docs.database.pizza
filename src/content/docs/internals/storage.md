---
title: Storage model
description: How PizzaSQL maps tables, rows, schemas, and indexes onto PizzaKV keys, and what lives in memory versus on disk.
---

PizzaSQL stores everything in **PizzaKV**, a key-value store, under a namespaced key scheme. There are no B-trees, no heap files, and no page format — just keys and values.

Row values use a **versioned binary codec** (magic prefix `PZSQLROW`, format version 1), with a **legacy JSON fallback** for values the binary codec cannot represent and for rows written before the migration. Schema, catalog, and index metadata remain JSON documents. See [Data types](/sql-reference/data-types/) for the value-level consequences.

## Namespacing

Every key is prefixed by the database name, so each database is an isolated namespace within the same PizzaKV store. Table and index names are lowercased in keys, making them case-insensitive at the storage layer.

## Key layout

| Key pattern | Value |
| --- | --- |
| `<db>:_sys:tables` | JSON array of table names (the catalog) |
| `<db>:_schema:<table>` | JSON table schema (columns, primary key, `NextRowID`, `AutoIncrement`) |
| `<db>:_sys:rowid:<table>` | rowid counter state |
| `<db>:_data:<table>:<pk>` | a single row, versioned binary (`PZSQLROW`) or legacy JSON |
| `<db>:indexes` | JSON array of index names |
| `<db>:index:<name>` | JSON index definition (name, table, columns, unique) |
| `<db>:idx:<name>:<value>` | index entry (value → rowids); **only ever cleared, never written** |

The table schema is the source of truth for a table's columns and its `NextRowID` counter. Rows are keyed by their primary-key value; the rowid (`_rowid_`) is stored inside the encoded row itself.

## The row encoding

Rows are encoded with a deterministic, compact, versioned binary format rather than JSON:

- **Magic prefix.** Every binary row begins with the bytes `PZSQLROW`, chosen so it can never collide with the leading character of a legacy JSON value (`{`, `[`, `"`, a digit, `t`, `f`, or `n`). The decoder disambiguates the two formats solely from this prefix.
- **Version byte.** The format version (currently `1`) follows the magic. Bumping it would mark old bytes as undecodable, so it only changes when the layout changes.
- **Field table.** Field names are sorted so identical rows always encode to identical bytes. Each field is a length-prefixed name plus a one-byte type tag and its payload.
- **Type tags.** Nil, boolean, signed/unsigned integers (normalized to `int64`/`uint64`), `float32`, `float64`, strings, raw bytes, and `json.Number` (preserved verbatim as decimal bytes) each have a dedicated tag.
- **JSON fallback.** If any field value cannot be represented exactly (a slice, map, struct, or time value), the entire row is encoded as legacy JSON instead, so no data is lost.

New and updated rows use the binary codec. Rows written before the storage migration remain legacy JSON and are still read correctly; they are upgraded to binary as they are rewritten. Schema, catalog, and index definitions are cold metadata and remain JSON.

The storage layer reads a whole table by issuing a `reads <db>:_data:<table>:` prefix scan and decoding each value (binary or legacy JSON).

## The in-memory layer

On top of PizzaKV, each `TableManager`/`SchemaManager` keeps caches:

- **Row cache**: a table's rows, loaded on first `SELECT` and invalidated on write.
- **Rowid map**: rowid → row, for index lookups.
- **Index entry cache**: value → rowids for each warm index (see [Indexes](/engine/indexes/)).
- **Schema cache**: table and index definitions.

These caches are per database instance and are what make warm reads fast. They are derived state: after a restart they are rebuilt lazily from the durable keys.

## Rowid management

The next rowid is tracked in the table schema's `NextRowID` field. On first use after startup, the engine scans the table's rows to recover `max(rowid) + 1` (so rowid state doesn't need its own write-ahead entry). `INTEGER PRIMARY KEY` aliases this rowid; other primary keys get a separate, invisible rowid counter.

## What is and isn't durable

- **Durable**: table schemas, the catalog list, index definitions, and row data.
- **Not durable** (derived/rebuilt): rowid counter (recovered from data), index entries, and all in-memory caches.

This split is why index definitions survive a restart but their entries must be rebuilt, and why the first query after a cold start is slower than subsequent ones.

## Transactions and storage

Transactions stage data writes in a SQL-session overlay. At `COMMIT`, PizzaSQL sends observed versions and staged mutations to PizzaKV as one compare-and-batch request; stale observations produce a serialization conflict. `ROLLBACK` discards the overlay before it reaches storage. DDL bypasses this transaction overlay and is not rolled back. See [Transactions](/engine/transactions/).

## The managed service's storage

On database.pizza, each database is a PizzaSQL namespace inside a managed PizzaKV instance, provisioned and routed per organization. From your perspective the storage is opaque; the guarantees above still apply to your data, including the durability of schema/index definitions and row data.
