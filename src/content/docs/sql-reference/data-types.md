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

`JSONB` is handled as a native type rather than through affinity.

This is substring-based and case-insensitive. `VARCHAR(255)`, `TEXT`, `NCHAR`, and `CLOB` are all TEXT affinity; `INT`, `BIGINT`, `TINYINT`, and `SMALLINT` are all INTEGER affinity. `DATE`, `TIME`, `TIMESTAMP`, `DATETIME`, and `JSON` fall through to NUMERIC affinity. `JSONB` is a native type and does not use affinity.

## The types you can declare

| Type name | Affinity | Notes |
| --- | --- | --- |
| `INTEGER`, `INT`, `BIGINT`, `SMALLINT`, `TINYINT`, `MEDIUMINT` | INTEGER | `INTEGER PRIMARY KEY` becomes a rowid alias |
| `REAL`, `FLOAT`, `DOUBLE` | REAL | |
| `NUMERIC`, `DECIMAL(p,s)` | NUMERIC | precision/scale parsed but ignored |
| `TEXT`, `VARCHAR(n)`, `CHAR(n)`, `CHARACTER`, `CLOB`, `NCHAR`, `NVARCHAR` | TEXT | length ignored |
| `BLOB` | BLOB | stored as a string in practice |
| `BOOLEAN`, `BOOL` | BOOLEAN | stored as 1/0 |
| `JSONB` | native | validated, canonical JSON; OID 3802 over the wire |
| `TEXT[]`, `INTEGER[]`, `BOOLEAN[]`, `NUMERIC[]`, … | array | one-dimensional only; see below |

There is no `SERIAL`, `ENUM`, or user-defined type. There are no schemas. `UUID` is accepted as a type name but is stored with **TEXT affinity** — it is a plain text column with no native PostgreSQL UUID semantics.

`JSON` and `JSONB` are both accepted as column type names, with different behavior. `JSON` stores text and behaves like a `TEXT` column with the JSON1 functions. `JSONB` is native: values are validated and canonicalized on write (object keys sorted, duplicate keys last-wins, numbers normalized), stored as canonical text, and reported as OID 3802 over the wire. `JSONB` supports `->`, `->>`, `#>`, `#>>`, `@>`, `<@`, `?`, `?|`, `?&`, `||`, `-`, and `#-`, plus functions such as `jsonb_typeof`, `jsonb_set`, and `jsonb_each`. Equality is canonical-text equality, so `1` and `1.0` are equal after normalization. See [Functions](/sql-reference/functions/#jsonb).

One-dimensional array types are supported for `TEXT[]`, `VARCHAR(n)[]`, `INTEGER[]`, `BIGINT[]`, `SMALLINT[]`, `BOOLEAN[]`, `REAL[]`, `DOUBLE PRECISION[]`, and `NUMERIC[]`. `id = ANY($1)` and `expr <> ALL($1)` work, including text-format array parameters over the PostgreSQL wire. Multidimensional arrays, other element types, and binary array parameters are rejected with `0A000`. See [Statements](/sql-reference/statements/).

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
- An **explicit column** named `rowid`, `oid`, or `_rowid_` takes precedence over the hidden rowid alias, matching SQLite — so a table with a real `oid TEXT` column resolves `oid` to that text column, not the integer rowid.
- `INTEGER PRIMARY KEY` (exactly an integer type, single column) **aliases the rowid** — the primary-key value *is* the rowid, and inserting without a value auto-assigns the next one.
- Any other primary key (e.g. `TEXT PRIMARY KEY`, or a table-level PK) is a normal column; the rowid is a separate, invisible counter maintained in parallel.
- `_rowid_` is not included in `SELECT *`; reference it explicitly (`SELECT rowid, * FROM t`).
- Over the PostgreSQL wire, the hidden alias is typed **`BIGINT`** (OID 20) rather than `TEXT`. The value is a signed 64-bit integer.
- Result type metadata reports the storage carrier, not a strict type. `SMALLINT`/`TINYINT` and integer `CAST` results advertise `int8` (20) because the engine carries int64 values; `NUMERIC`/`DECIMAL` advertise `float8` (701) because they are stored as float64 and are not exact. `INTEGER` still advertises `int4` (23) for compatibility, so values outside int32 can fail client decoding. Treat the OID as a decoding hint.
- `_rowid_` is **monotonic when the engine assigns it**: tables without an `INTEGER PRIMARY KEY` get 1, 2, 3, ... from a durable per-table counter, and the counter survives restarts. `WHERE _rowid_ > $1 ORDER BY _rowid_ LIMIT n` is therefore a correct keyset cursor: concurrent inserts append larger rowids and a page never repeats a row it already returned.
- On a table with a single `INTEGER PRIMARY KEY`, the inserted key **is** the rowid. Monotonicity then depends on the application: inserting `id = 5` after `id = 30` produces a smaller rowid. Do not use `_rowid_` pagination over client-assigned, non-increasing integer keys.
- `UPDATE` never rewrites the stored rowid, including an update that changes an `INTEGER PRIMARY KEY`. A cursor remains stable across updates, but on an integer-PK table the rowid can then differ from the current primary-key value.
- Explicit columns named `rowid`, `oid`, or `_rowid_` shadow the alias, as described above.

## Type introspection

`typeof(x)` returns one of `"null"`, `"integer"`, `"real"`, `"text"`, or `"blob"` based on the value's Go representation, mirroring SQLite.

## Caveats to keep in mind

- Column types are **not enforced**. Inserting a string into an `INTEGER` column succeeds; it's stored as text and coerced back when used.
- Very large or binary payloads are less efficient than in a native database. Treat `BLOB` as best-effort.
- `CAST(x AS type)` is a value conversion at query time, not a storage change. See [Expressions](/sql-reference/expressions/).
