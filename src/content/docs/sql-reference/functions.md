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
| `GROUP_CONCAT(expr [, separator])` | concatenates non-`NULL` values with `,` by default; `DISTINCT` de-duplicates; returns `NULL` when there are no values |
| `STRING_AGG(expr, delimiter)` | PostgreSQL-style text aggregation of non-`NULL` values; `DISTINCT` is supported; a `NULL` delimiter returns `NULL` |
| `TOTAL(expr)` | sum as a real; returns `0` (not `NULL`) when there are no values |

- Aggregates may be nested inside expressions: `SELECT sum(x) / count(x) FROM t`.
- On an empty input set, `COUNT` and `TOTAL` return `0`; `SUM`, `AVG`, `MIN`, `MAX`, and `GROUP_CONCAT` return `NULL`.
- `MIN`/`MAX` also work as *scalar* functions over multiple arguments: `MIN(a, b, c)`.
- `GROUP_CONCAT(DISTINCT expr)` de-duplicates after `NULL` values are skipped. The optional separator is evaluated per row (use a literal).

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
| `concat(a, b, ...)` | concatenate all arguments as text (NULL becomes an empty string) |
| `concat_ws(sep, a, b, ...)` | join non-`NULL` arguments with `sep`; a `NULL` separator returns `NULL` |

### Numbers

| Function | Description |
| --- | --- |
| `abs(x)` | absolute value |
| `round(x[, n])` | round to `n` decimals (naive implementation; see caveats) |
| `min(a, b, ...)` | scalar minimum |
| `max(a, b, ...)` | scalar maximum |
| `random()` | random 64-bit integer |
| `percent_diff(a, b)` | percentage difference between two values |

### Arrays

| Function | Description |
| --- | --- |
| `array_length(arr, dim)` | Length of a dimension (`1` for a one-dimensional array); `NULL` when the array is empty or the dimension does not exist |
| `unnest(arr)` | Expand an array into rows; supported as the only `FROM` item |
| `arr[n]` | 1-based element access; out-of-range and `NULL` arrays return `NULL` |
| `arr @> arr` / `arr <@ arr` | containment; each element on the right must match some element on the left |
| `unnest(arr) AS t(col)` | expand an array into rows with a column alias list |

One-dimensional arrays are supported for text, integer, boolean, real, and numeric
element types. See [Statements](/sql-reference/statements/) for array literals,
parameters, `ANY`/`ALL` predicates, and containment.

### JSON

PizzaSQL implements a JSON1-compatible function subset. JSON values are stored
as text; there is no native JSON type or JSON operators.

| Function | Description |
| --- | --- |
| `json(x)` / `jsonb(x)` | validate and normalize JSON text |
| `json_valid(x)` / `jsonb_valid(x)` | `1` when the value is valid JSON, else `0` |
| `json_type(x[, path])` | JSON type at the value or path |
| `json_extract(x, path, ...)` / `jsonb_extract(...)` | extract one or more values by path |
| `json_set(x, path, value, ...)` / `jsonb_set(...)` | set or create values at paths |
| `json_insert(x, path, value, ...)` / `jsonb_insert(...)` | insert values only where paths do not exist |
| `json_replace(x, path, value, ...)` / `jsonb_replace(...)` | replace values only where paths exist |
| `json_remove(x, path, ...)` / `jsonb_remove(...)` | remove values at paths |
| `json_array(...)` / `jsonb_array(...)` | construct a JSON array |
| `json_array_length(x[, path])` | number of elements in an array (0 for a valid non-array; malformed JSON fails) |
| `json_object(key, value, ...)` / `jsonb_object(...)` | construct a JSON object from text keys and values |
| `json_quote(x)` / `jsonb_quote(x)` | return a JSON string literal for the value |
| `json_group_array(x)` / `jsonb_group_array(x)` | aggregate values into a JSON array |

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
| `pizzasql_version()` | PizzaSQL engine build identity (for example `v0.1.0-3-gabc1234`) |
| `sqlite_version()` | the documented SQLite compatibility floor, `3.35.0` |
| `pg_backend_pid()` | the synthetic PostgreSQL backend PID advertised in `BackendKeyData` for this connection |

These helpers cover common driver and migration probes; they are not a claim
that every PostgreSQL function exists. Aggregate `ORDER BY` inside `STRING_AGG`
is not supported.

`pizzasql_version()` is deliberately independent of the `server_version`/`version()` PostgreSQL compatibility string and of `sqlite_version()`. See [Engine build and capabilities](/sql-reference/compatibility/#engine-build-and-capability-discovery) for the wire-protocol and HTTP discovery endpoints.

### JSON

JSON lives in ordinary text. These SQLite JSON1 functions are implemented:

| Function | Behavior |
| --- | --- |
| `json(text)` | validates and returns the canonical JSON text |
| `json_valid(text)` | `1` for valid JSON, `0` otherwise (never throws) |
| `json_type(text)` | `null`, `true`, `false`, `integer`, `real`, `text`, `array`, or `object` |
| `json_extract(text, path, ...)` | path lookup; returns SQL `NULL` for a missing path |
| `json_set`, `json_insert`, `json_replace`, `json_remove` | partial document updates |
| `json_array`, `json_object`, `json_quote` | constructors |
| `json_array_length(text[, path])` | array length; `0` for a valid non-array |
| `json_group_array` | aggregate that builds a JSON array |

Malformed input to `json`, `json_extract`, or the mutators fails the statement with `malformed JSON`; `json_valid` is the non-throwing probe. The `->` and `->>` operators are available in addition to `json_extract`: `->` returns the member as JSON text (a string keeps its quotes, and JSON `null` stays JSON null), while `->>` returns the SQL value (text, number, `1`/`0` for booleans, or `NULL` for JSON null). Both accept an object label or an array index (negative counts from the end), chain left-to-right, bind tighter than arithmetic and comparison but looser than unary operators, and return `NULL` for a missing path or `NULL` input. Store documents in a `TEXT` column when you want plain text behavior, or use the native `JSONB` type below.

### JSONB

`JSONB` is a native canonical type (OID 3802). Values are validated on write, object keys are sorted, duplicate keys keep the last value, and numbers are normalized, so equality is independent of key order and formatting. `JSON` and `TEXT` columns keep the JSON1 behavior above.

| Operator | Description |
| --- | --- |
| `->` / `->>` | object field or array element as JSONB / SQL text |
| `#>` / `#>>` | path (`'{a,0,b}'`) as JSONB / SQL text |
| `@>` / `<@` | containment |
| `?` / `?\|` / `?&` | key or array-element existence |
| `\|\|` | shallow object merge or array concatenation |
| `-` / `#-` | delete a key or element / delete a path |

| Function | Description |
| --- | --- |
| `jsonb_typeof(x)` | `null`, `boolean`, `number`, `string`, `array`, or `object` |
| `jsonb_array_length(x)` | array length |
| `jsonb_each(x)` / `jsonb_each_text(x)` | expand an object into `(key, value)` rows |
| `jsonb_array_elements(x)` / `jsonb_array_elements_text(x)` | expand an array into rows |
| `jsonb_object_keys(x)` | expand object keys into rows |
| `jsonb_strip_nulls(x)` | remove object members whose value is JSON null |
| `jsonb_pretty(x)` | indented JSON text |
| `jsonb_set(x, path, value [, create_missing])` | replace or create a path |
| `jsonb_insert(x, path, value [, insert_after])` | insert at an array position |
| `jsonb_build_object(...)` / `jsonb_build_array(...)` | construct a value |
| `to_jsonb(x)` | convert a SQL value to JSONB |

`jsonb_set`, `jsonb_insert`, and `jsonb_replace` accept PostgreSQL `{a,b}` paths (the value is parsed as JSON) and JSON1 `$` paths (a plain SQL string stays a string). jsonpath functions (`jsonb_path_*`) and GIN indexing are not supported and are rejected with `0A000`.

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
