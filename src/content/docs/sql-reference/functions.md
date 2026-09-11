---
title: Functions
description: Every built-in scalar and aggregate function, with an honest list of which are real and which are declared but not implemented.
---

PizzaSQL ships a fixed set of built-in functions. There are no user-defined functions, no `CREATE FUNCTION`, and no extension mechanism.

A few functions are *declared* in the engine's function catalog (so they parse without an "unknown function" error) but are **not implemented** in the executor — they return `NULL`. Those are listed separately so you don't mistake their presence in autocomplete for real behaviour.

## Aggregate functions

Used in `SELECT` with or without `GROUP BY`, and in `HAVING`.

| Function | Description |
| --- | --- |
| `COUNT(*)` | number of rows |
| `COUNT(expr)` | number of non-`NULL` values |
| `COUNT(DISTINCT expr)` | number of distinct non-`NULL` values |
| `SUM(expr)` | sum; integer result when all inputs are integers, otherwise real; `NULL` when no values |
| `SUM(DISTINCT expr)` | distinct sum |
| `AVG(expr)` | average (real); `NULL` when no values |
| `MIN(expr)` | minimum, ignoring `NULL`s |
| `MAX(expr)` | maximum, ignoring `NULL`s |

- Aggregates may be nested inside expressions: `SELECT sum(x) / count(x) FROM t`.
- On an empty input set, `COUNT` returns `0`; `SUM`, `AVG`, `MIN`, `MAX` return `NULL`.
- `MIN`/`MAX` also work as *scalar* functions over multiple arguments: `MIN(a, b, c)`.
- `TOTAL` and `GROUP_CONCAT` are declared in the catalog but **not implemented** — do not rely on them.

## Scalar functions

### Strings

| Function | Description |
| --- | --- |
| `upper(s)` | uppercase |
| `lower(s)` | lowercase |
| `length(s)` | character length |
| `substr(s, start[, len])` / `substring(...)` | 1-indexed substring |
| `trim(s)` | trims whitespace |
| `replace(s, find, repl)` | replace all occurrences |
| `instr(s, sub)` | 1-indexed position of `sub`, or `0` |
| `printf(format, ...)` | `fmt.Sprintf`-style formatting |
| `concat(a, b, ...)` | concatenate all arguments as text |

### Numbers

| Function | Description |
| --- | --- |
| `abs(x)` | absolute value |
| `round(x[, n])` | round to `n` decimals (naive implementation; see caveats) |
| `min(a, b, ...)` | scalar minimum |
| `max(a, b, ...)` | scalar maximum |
| `random()` | random 64-bit integer |

### NULL handling

| Function | Description |
| --- | --- |
| `coalesce(a, b, ...)` | first non-`NULL` argument |
| `ifnull(a, b)` | `b` when `a` is `NULL`, else `a` |
| `nullif(a, b)` | `NULL` when `a` equals `b`, else `a` |

### Type

| Function | Description |
| --- | --- |
| `typeof(x)` | `"null"`, `"integer"`, `"real"`, `"text"`, or `"blob"` |

### Blobs and encoding

| Function | Description |
| --- | --- |
| `hex(x)` | uppercase hex of the value's bytes |
| `unhex(x)` | decode hex to a string |
| `zeroblob(n)` | a string of `n` NUL bytes (capped at 1 MiB) |

### Date/time

| Function | Description |
| --- | --- |
| `date(...)` | `YYYY-MM-DD` |
| `time(...)` | `HH:MM:SS` |
| `datetime(...)` | `YYYY-MM-DD HH:MM:SS` |
| `julianday(...)` | Julian day number |
| `unixepoch(...)` | Unix seconds (or fractional with `subsec`) |
| `strftime(format, ...)` | formatted time |
| `timediff(a, b)` | `±YYYY-MM-DD HH:MM:SS.SSS` from `b` to `a` |

Date/time functions accept SQLite-style time values and modifiers:

- Time values: `'now'`, ISO-8601 text (e.g. `'2026-01-02 03:04:05'`), or a numeric Julian day (optionally followed by `unixepoch`, `julianday`, or `auto`).
- Modifiers: `NNN days|hours|minutes|seconds|months|years`, `start of day|month|year`, `weekday N`, `utc`, `localtime`, `subsec`/`subsecond`, and `±YYYY-MM-DD HH:MM:SS.SSS`.
- Unknown modifiers are silently ignored rather than erroring.

### Version

| Function | Description |
| --- | --- |
| `pizzasql_version()` | engine build version |
| `sqlite_version()` | same value, for SQLite compatibility |

### Session state

These mirror SQLite's connection-local counters and are tracked per connection:

| Function | Description |
| --- | --- |
| `last_insert_rowid()` | rowid of the most recent successful `INSERT` on this connection; `0` before any insert |
| `changes()` | number of rows changed by the most recent `INSERT`/`UPDATE`/`DELETE` |
| `total_changes()` | total rows changed since this connection opened; monotonic, never decremented by `ROLLBACK` |

Notes:

- `last_insert_rowid()` reflects the actual generated rowid (not a naive counter or `MAX`), including for multi-row `INSERT` and `INSERT ... SELECT`, and holds across `ROLLBACK`.
- `total_changes()` is incremented by every completed DML statement even when the change is later undone, matching SQLite.

## Declared but not implemented

These names are recognized by the parser/analyzer but **return `NULL` when called**. Treat them as unsupported:

- `ltrim`, `rtrim`
- `ceil`, `floor`
- `mod`
- `iif`
- `quote`
- `total`, `group_concat`
- `randomblob` is implemented in the executor but not registered with the analyzer, so calls are currently rejected as an unknown function.

## Caveats

- `round` uses `int64(v*mult + 0.5)` and only behaves correctly for non-negative decimal counts; treat it as approximate for edge cases.
- `random()` is not cryptographically secure — do not use it for secrets.
- `zeroblob` is capped at 1 MiB regardless of the requested size.
- `printf` uses Go's `fmt.Sprintf`, whose format verbs differ from SQLite's `printf` in places.
