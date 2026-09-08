---
title: Expressions & operators
description: Operators, CASE, IN, BETWEEN, LIKE, CAST, and subqueries — with precise coercion and three-valued logic semantics.
---

## Operator precedence

Expressions evaluate with standard precedence, from tightest to loosest:

1. Parentheses and unary `+` / `-` / `NOT`
2. `*`, `/`, `%`
3. `+`, `-`, `||`
4. comparison `=`, `<>`/`!=`, `<`, `<=`, `>`, `>=`
5. `NOT`
6. `AND`
7. `OR`

`IS NULL`, `IN`, `BETWEEN`, and `LIKE` are predicates parsed at the comparison level.

## Arithmetic

| Operator | Meaning |
| --- | --- |
| `+ - *` | numeric |
| `/` | division — integer when both operands are integers (truncates toward zero) |
| `%` | modulo |
| `||` | string concatenation |

- Arithmetic on a `NULL` operand yields `NULL`.
- **Division or modulo by zero returns `NULL`**, not an error.
- Integer operands produce integer results; mixing a real promotes to real. Strings that parse as numbers are coerced.
- `||` renders both sides as text and never propagates `NULL`: `NULL || 'x'` → `'x'`.

## Comparison

`=`, `<>` (or `!=`), `<`, `<=`, `>`, `>=` follow three-valued logic: if either operand is `NULL`, the result is `NULL` (which behaves as false in a `WHERE` filter).

Comparison first tries to compare numerically (if both sides parse as numbers) and falls back to lexicographic string comparison otherwise.

## Logical operators

`AND` and `OR` implement SQL three-valued logic:

| | TRUE | FALSE | NULL |
| --- | --- | --- | --- |
| `TRUE AND` | TRUE | FALSE | NULL |
| `FALSE AND` | FALSE | FALSE | FALSE |
| `NULL AND` | NULL | FALSE | NULL |
| `TRUE OR` | TRUE | TRUE | TRUE |
| `FALSE OR` | TRUE | FALSE | NULL |
| `NULL OR` | TRUE | NULL | NULL |

`NOT NULL` is `NULL`.

## CASE

Both forms are supported:

```sql
-- simple CASE
SELECT CASE status WHEN 'a' THEN 1 WHEN 'b' THEN 2 ELSE 0 END FROM t;

-- searched CASE
SELECT CASE WHEN x > 0 THEN 'pos' WHEN x < 0 THEN 'neg' ELSE 'zero' END FROM t;
```

- A simple `CASE` with a `NULL` operand matches nothing.
- A searched `CASE` treats a `NULL` condition as false.
- No `ELSE` and no match returns `NULL`.

## CAST

```sql
CAST(expr AS TYPE)
```

`TYPE` may be any recognized type name. `CAST(NULL AS anything)` is `NULL`. Conversions:

- to `INTEGER`-family → truncates toward zero (`int64(value)`).
- to `REAL`/`FLOAT`/`DOUBLE`/`NUMERIC`/`DECIMAL` → float.
- to `TEXT`/`VARCHAR`/`CHAR` → string rendering.
- Any other target returns the value unchanged.

## Predicates

### IS NULL

```sql
x IS NULL
x IS NOT NULL
```

### IN

```sql
x IN (1, 2, 3)
x IN (SELECT ...)      -- exactly one column
x NOT IN (...)
```

Full three-valued logic: `NULL IN (...)` is `NULL`; an empty list is `FALSE` for `IN` and `TRUE` for `NOT IN`; a list containing `NULL` with no match yields `NULL`.

### BETWEEN

```sql
x BETWEEN low AND high
x NOT BETWEEN low AND high
```

Equivalent to `x >= low AND x <= high` (respectively `x < low OR x > high`) with three-valued `NULL` handling.

### LIKE

```sql
x LIKE 'pattern'
x NOT LIKE 'pattern'
x LIKE 'pattern' ESCAPE 'char'
```

- `%` matches any sequence, `_` matches a single character.
- Matching is **case-insensitive** (both sides are lowercased).
- The `ESCAPE` clause is parsed but **ignored** — the escape character is treated literally.

### EXISTS

```sql
EXISTS (SELECT ...)
```

Returns `TRUE` if the subquery returns at least one row, including for correlated subqueries.

## Subqueries

- **Scalar subqueries** return the first column of the first row, or `NULL` when empty. Unlike strict SQL, a multi-row scalar subquery returns the first value rather than erroring.
- **Correlated subqueries** reference outer columns and are re-evaluated per outer row.
- Non-correlated `IN (SELECT ...)` results are cached for the duration of the enclosing query.
- A small, specialized optimization decorrelates scalar aggregate subqueries of the form `(SELECT COUNT(*)/SUM/AVG/MIN/MAX(col) FROM inner WHERE inner.key = outer.key)`.

## Column references

- Unqualified references resolve against the visible tables; ambiguous references across joined tables are an analysis error.
- Qualified references use `table.column` or `alias.column`.
- `rowid`, `oid`, and `_rowid_` resolve to the implicit rowid.

## Constant folding

A `WHERE` clause that references no columns (e.g. `WHERE 1 = 1`) is evaluated once; a constant-false `WHERE` short-circuits to an empty result (or a single aggregated row for aggregate queries). This is an optimization, not a guarantee, and doesn't imply a general planner.
