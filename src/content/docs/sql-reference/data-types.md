---
title: Data types
description: How PizzaSQL stores and coerces values — SQLite-style type affinity over versioned binary rows, not strict typed columns.
---

PizzaSQL follows SQLite's **type affinity** model rather than PostgreSQL's strict typing. A column's declared type is a *hint* about how values are converted and compared; it does not constrain what you can store. There is no fixed-size enforcement, no strict typing error on insert, and no `VARCHAR(n)` length limit.

Under the hood, every row is stored in a **versioned binary codec** (see [Storage model](/internals/storage/)), with a legacy JSON fallback, which shapes a lot of the behaviour below.

## Affinity rules

A column's affinity is derived from its declared type name using the SQLite rules:

| Declared type contains | Affinity |
| --- | --- |
| `INT` | INTEGER |
| `CHAR`, `CLOB`, or `TEXT` | TEXT |
| `BLOB`, or empty type | BLOB |
| `REAL`, `FLOA`, or `DOUB` | REAL |
| `BOOLEAN` / `BOOL` | BOOLEAN |
| anything else (e.g. `NUMERIC`, `DECIMAL`, `DATE`, `DATETIME`, `JSON`) | NUMERIC |

This is substring-based and case-insensitive. `VARCHAR(255)`, `TEXT`, `NCHAR`, and `CLOB` are all TEXT affinity; `INT`, `BIGINT`, `TINYINT`, and `SMALLINT` are all INTEGER affinity. `DATE`, `TIME`, `TIMESTAMP`, `DATETIME`, `JSON`, and `JSONB` are recognised as type names but all fall through to NUMERIC affinity.

## The types you can declare

| Type name | Affinity | Notes |
| --- | --- | --- |
| `INTEGER`, `INT`, `BIGINT`, `SMALLINT`, `TINYINT`, `MEDIUMINT` | INTEGER | `INTEGER PRIMARY KEY` becomes a rowid alias |
| `REAL`, `FLOAT`, `DOUBLE` | REAL | |
| `NUMERIC`, `DECIMAL(p,s)` | NUMERIC | precision/scale parsed but ignored |
| `TEXT`, `VARCHAR(n)`, `CHAR(n)`, `CHARACTER`, `CLOB`, `NCHAR`, `NVARCHAR` | TEXT | length ignored |
| `BLOB` | BLOB | stored as a string in practice |
| `BOOLEAN`, `BOOL` | BOOLEAN | stored as 1/0 |

There is no `ARRAY`, `JSONB`-specific, `UUID`, `SERIAL`, or `ENUM` type. There are no schemas or user-defined types.

## How values are actually stored

Rows use a versioned binary encoding (`PZSQLROW`) with a legacy JSON fallback for values the codec cannot represent. Each value carries a one-byte type tag, so it round-trips without the float64 lossiness of the old JSON encoding:

- **Integers** are stored as fixed-width signed or unsigned values, normalized to `int64`/`uint64`, so integer columns keep exact values.
- **Floats** are stored as `float32` or `float64`. Decimal numbers that arrived as JSON are preserved verbatim as their decimal bytes.
- **`BOOLEAN` is an integer** (`1`/`0`), matching SQLite. `TRUE` and `FALSE` are literal spellings for those integers.
- **BLOBs are strings** in practice — the engine represents them as text values. There is no real binary type on the wire; over PostgreSQL the column is advertised as `BYTEA` (OID 17) but the value travels as text.
- `NULL` is a nil tag in the encoding.

If a row contains a value the binary codec cannot represent exactly (a slice, map, struct, or time value), the whole row falls back to legacy JSON so no data is lost.

## Coercion

Values are coerced on use, not on insert. The key rules:

- **Arithmetic** (`+`, `-`, `*`, `/`, `%`): if both operands are integers the result is an integer (integer division truncates toward zero); otherwise operands are coerced to floats. Strings that look like numbers are parsed. Division or modulo by zero returns `NULL`.
- **Comparison** (`=`, `<`, `>` etc.): operands are compared numerically if both can be parsed as numbers, otherwise as strings.
- **`||`** concatenation: both sides are rendered as text; `NULL || 'x'` yields `'x'` (unlike PostgreSQL's `NULL` propagation).
- **Truthiness** (`toBool`): `0` and `""` and `"0"` and `"false"` (case-insensitive) are false; any other non-empty value is true; `NULL` is false when coerced to a boolean.

## ROWID

Every row carries an implicit **`_rowid_`**, even when no `INTEGER PRIMARY KEY` is declared:

- `rowid`, `oid`, and `_rowid_` all refer to the same value.
- `INTEGER PRIMARY KEY` (exactly an integer type, single column) **aliases the rowid** — the primary-key value *is* the rowid, and inserting without a value auto-assigns the next one.
- Any other primary key (e.g. `TEXT PRIMARY KEY`, or a table-level PK) is a normal column; the rowid is a separate, invisible counter maintained in parallel.
- `_rowid_` is not included in `SELECT *`; reference it explicitly (`SELECT rowid, * FROM t`).

## Type introspection

`typeof(x)` returns one of `"null"`, `"integer"`, `"real"`, `"text"`, or `"blob"` based on the value's Go representation, mirroring SQLite.

## Caveats to keep in mind

- Column types are **not enforced**. Inserting a string into an `INTEGER` column succeeds; it's stored as text and coerced back when used.
- Very large or binary payloads are less efficient than in a native database. Treat `BLOB` as best-effort.
- `CAST(x AS type)` is a value conversion at query time, not a storage change. See [Expressions](/sql-reference/expressions/).
