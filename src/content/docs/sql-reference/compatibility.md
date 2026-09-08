---
title: Compatibility
description: How PizzaSQL differs from SQLite and PostgreSQL — the honest gap list, including features that parse but do nothing.
---

PizzaSQL is a relational database with a SQLite-inspired SQL dialect and partial PostgreSQL wire-protocol compatibility. It is **not** PostgreSQL, and it is **not** a drop-in SQLite replacement.

This page describes behavior verified in the current source and tests. The SQLite column uses modern SQLite 3.39 or newer as its reference, and the PostgreSQL column uses PostgreSQL 14. Optional SQLite extensions may behave differently.

## Status key

| Status | Meaning |
| --- | --- |
| **Supported** | Implemented end to end. Important differences are noted. |
| **Partial** | Usable for a subset of the reference behavior. |
| **Unsupported** | Rejected or not implemented. |
| **Unsafe** | Syntax may be accepted, but behavior is incorrect or not enforced. |
| **Unverified** | Expected or claimed, but not covered by reliable automated evidence. |

## Positioning

| Dimension | PizzaSQL |
| --- | --- |
| SQL dialect | SQLite-inspired, with documented differences |
| Wire protocol | Partial PostgreSQL v3 simple and extended query protocols |
| Type system | Dynamic values with partial SQLite-style affinity |
| Storage | Versioned binary rows in PizzaKV |
| Transactions | Optimistic compare-batch DML transactions; DDL is non-transactional |
| Planner | Heuristic index selection, otherwise scans |

## Important limitations

Do not rely on the following behavior yet:

- `UNIQUE`, `CHECK`, and foreign-key declarations may be accepted but are not enforced.
- Composite primary keys retain only their first column.
- `RIGHT JOIN`, `FULL JOIN`, `JOIN ... USING`, and `NATURAL JOIN` may parse but do not execute correctly.
- DDL changes such as `CREATE TABLE` are not rolled back by `ROLLBACK`.
- `GROUP_CONCAT` and `TOTAL` are not safe to execute.
- PostgreSQL result columns may be reported as `TEXT` regardless of their SQL type.

Unsupported syntax normally returns an error. The items above are called out separately because accepting syntax without enforcing its semantics can cause incorrect application behavior.

## Queries

| Capability | PizzaSQL | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| Basic `SELECT`, expressions, and aliases | Supported | Supported | Supported |
| `WHERE` | Supported | Supported | Supported |
| `DISTINCT` | Supported | Supported | Supported |
| `ORDER BY`, `LIMIT`, and `OFFSET` | Supported | Supported | Supported |
| `GROUP BY` and `HAVING` | Supported; permissive SQLite-style grouping | Supported | Supported; stricter grouping rules |
| `INNER JOIN` | Supported | Supported | Supported |
| `LEFT JOIN` | Supported | Supported | Supported |
| `CROSS JOIN` and comma joins | Supported | Supported | Supported |
| `RIGHT JOIN` and `FULL JOIN` | Unsafe; parsed but not executed correctly | Supported since 3.39 | Supported |
| `JOIN ... ON` | Supported | Supported | Supported |
| `JOIN ... USING` | Unsafe; join condition is not applied | Supported | Supported |
| `NATURAL JOIN` | Unsafe; join columns are not derived | Supported | Supported |
| Scalar subqueries | Supported; multiple rows use the first row | Supported; multiple rows use the first row | Multiple rows produce an error |
| Correlated subqueries | Supported | Supported | Supported |
| `EXISTS` and `IN (SELECT ...)` | Supported | Supported | Supported |
| Subqueries in `FROM` | Supported | Supported | Supported |
| `UNION` and `UNION ALL` | Supported | Supported | Supported |
| `INTERSECT` and `EXCEPT` | Supported; distinct form only | Supported | Supported, including `ALL` |
| Common table expressions (`WITH`) | Unsupported | Supported | Supported |
| Recursive common table expressions | Unsupported | Supported | Supported |
| Window functions | Unsupported | Supported | Supported |

## Writes

| Capability | PizzaSQL | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| Single-row and multi-row `INSERT` | Supported | Supported | Supported |
| `INSERT ... SELECT` | Supported | Supported | Supported |
| `UPDATE` | Supported | Supported | Supported |
| `DELETE` | Supported | Supported | Supported |
| `INSERT OR IGNORE`, `REPLACE`, and related SQLite conflict modes | Supported | Supported | Different syntax |
| `ON CONFLICT DO NOTHING` | Partial; primary-key conflicts only | Supported for unique constraints | Supported for unique constraints |
| `ON CONFLICT DO UPDATE` | Partial; primary-key conflicts only | Supported for unique constraints | Supported for unique constraints |
| `RETURNING` | Unsupported | Supported since 3.35 | Supported |
| `TRUNCATE` | Unsupported | Unsupported | Supported |

## Schema and constraints

| Capability | PizzaSQL | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| `CREATE TABLE` and `DROP TABLE` | Supported | Supported | Supported |
| `CREATE TABLE IF NOT EXISTS` | Supported | Supported | Supported |
| `ALTER TABLE ADD/DROP/RENAME` | Partial | Partial | Supported |
| Altering column type, default, or nullability | Unsupported | Limited | Supported |
| `CREATE INDEX` and `DROP INDEX` | Partial; indexes are rebuilt from stored rows | Supported | Supported |
| `CREATE INDEX IF NOT EXISTS` | Supported in current source; deployed versions may differ | Supported | Supported |
| Views | Partial; not persisted across executor restarts | Persistent | Persistent |
| Triggers | Unsupported | Supported | Supported |
| Single-column primary keys | Supported | Supported | Supported |
| Composite primary keys | Unsafe; only the first column is retained | Supported | Supported |
| `NOT NULL` | Supported | Supported | Supported |
| `UNIQUE` constraints | Unsafe; parsed but not enforced | Supported | Supported |
| Unique indexes | Unsafe; uniqueness is not enforced | Supported | Supported |
| `CHECK` constraints | Unsafe; parsed but not enforced | Supported | Supported |
| Foreign keys | Unsafe; parsed but not enforced | Supported when enabled | Supported |
| Literal defaults | Partial | Supported | Supported |
| Expression defaults | Partial | Supported | Supported |
| `DEFAULT CURRENT_TIMESTAMP` | Unsafe; does not evaluate per inserted row | Supported | Supported |
| `AUTOINCREMENT` | Partial; accepted without distinct SQLite semantics | Supported | Not applicable |
| Identity and serial columns | Unsupported | Not applicable | Supported |
| Generated columns | Unsupported | Supported | Supported |
| Implicit `rowid` | Partial | Supported | Unsupported |

## Types and expressions

PizzaSQL accepts many familiar type names but does not implement PostgreSQL's strict type system. Declared precision and scale are not enforced, and values are not consistently coerced to a column's declared affinity when inserted.

| Capability | PizzaSQL | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| Integer and floating-point values | Supported | Supported | Supported |
| Text values | Supported | Supported | Supported |
| Boolean values | Supported | Integer convention | Supported |
| Binary/BLOB values | Partial | Supported | Supported as `BYTEA` |
| SQLite type affinity | Partial; affinity names accepted without complete coercion | Supported | Not applicable |
| Strict PostgreSQL types | Unsupported | Unsupported | Supported |
| `NUMERIC(p,s)` precision enforcement | Unsupported | Unsupported | Supported |
| Native date and time types | Unsupported; values remain dynamically typed | Unsupported | Supported |
| JSON values, functions, and operators | Unsupported; `JSON` names have no JSON semantics | Available with SQLite JSON support | Supported with `JSON` and `JSONB` |
| Arrays, UUIDs, enums, and intervals | Unsupported | Unsupported as native types | Supported |
| `CAST` to integer, real, and text | Supported | Supported | Supported |
| Other `CAST` targets | Partial; many targets are no-ops | Affinity based | Strictly typed |
| PostgreSQL `::` casts | Unsupported | Unsupported | Supported |
| SQL three-valued NULL logic | Supported | Supported | Supported |
| `LIKE` | Supported; case-insensitive | Case-insensitive by default | Case-sensitive; `ILIKE` is separate |
| Collations | Unsupported | Supported | Supported |
| Bitwise, regular-expression, and JSON operators | Unsupported | Partial | Supported |

## Functions

| Capability | PizzaSQL | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| `COUNT`, `SUM`, `AVG`, `MIN`, and `MAX` | Supported | Supported | Supported |
| `COUNT(DISTINCT ...)` | Supported | Supported | Supported |
| `GROUP_CONCAT` | Unsafe; currently has a recursion failure | Supported | Use `STRING_AGG` |
| `TOTAL` | Unsafe; currently has a recursion failure | Supported | Unsupported |
| Common string functions | Partial | Supported | Supported |
| Common math functions | Partial | Supported | Supported |
| `CEIL`, `FLOOR`, and `MOD` | Unsafe; declared but currently return `NULL` | Supported | Supported |
| SQLite date and time functions | Supported | Supported | Different function set |
| PostgreSQL date and time functions | Unsupported | Unsupported | Supported |
| JSON functions | Unsupported | Available with SQLite JSON support | Supported |
| Window functions | Unsupported | Supported | Supported |

## Transactions

| Capability | PizzaSQL | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| `BEGIN`, `COMMIT`, and `ROLLBACK` for DML | Supported | Supported | Supported |
| Read-your-writes | Supported | Supported | Supported |
| Savepoints | Supported | Supported | Supported |
| Concurrent write conflict detection | Supported; optimistic serialization failures | Serialized writers | MVCC and serialization modes |
| Transactional DDL | Unsupported | Supported | Supported |
| Transactions through database.pizza HTTP query endpoints | Unsupported | Client dependent | Client dependent |

## PostgreSQL clients and wire protocol

PostgreSQL wire compatibility allows some PostgreSQL clients to connect. It does not make the SQL dialect or server behavior PostgreSQL-compatible.

| Capability | PizzaSQL | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| PostgreSQL v3 wire protocol | Partial | Not applicable | Native |
| Simple-query protocol | Supported | Not applicable | Supported |
| Extended-query protocol | Partial | Not applicable | Supported |
| Prepared statements | Partial; parameters are rewritten as SQL literals | Not applicable | Native |
| Text parameters and results | Supported | Not applicable | Supported |
| Binary parameters | Partial; limited boolean and integer support | Not applicable | Supported |
| Binary results | Unsupported | Not applicable | Supported |
| Correct result type OIDs | Unsafe; normal query columns may be reported as `TEXT` | Not applicable | Supported |
| PostgreSQL TLS | Unsupported | Not applicable | Supported |
| PostgreSQL SCRAM and MD5 authentication | Unsupported | Not applicable | Supported |
| `information_schema` | Partial emulation | Unsupported | Supported |
| `pg_catalog` | Unsupported | Unsupported | Supported |
| Query cancellation | Unsupported | Not applicable | Supported |
| `COPY` | Unsupported | Not applicable | Supported |
| `LISTEN` and `NOTIFY` | Unsupported | Not applicable | Supported |
| Node.js `pg` | Basic use verified | Not applicable | Supported |
| psycopg, pgx, and lib/pq | Unverified | Not applicable | Supported |
| ORMs and migration frameworks | Unverified | Varies | Supported |
| `psql` schema introspection commands | Partial | Not applicable | Supported |

Because the wire is PostgreSQL-compatible, drivers may issue introspection queries such as `information_schema`, `pg_catalog`, `SELECT version()`, or `SHOW server_version` on connection. PizzaSQL emulates a small subset of these so basic clients can start. See [PostgreSQL protocol](/internals/postgres-protocol/).

## Managed service differences

The managed database.pizza proxy layers additional behavior on top of PizzaSQL:

- API keys with `read`, `write`, `alter_table`, and `drop_table` scopes gate statements.
- PostgreSQL TLS is currently declined. Connections require `sslmode=disable`, so credentials and query traffic are not protected on an untrusted network.
- The PostgreSQL database name is `org/db`; the slash must be percent-encoded in a URI.
- Transaction statements are rejected by the managed HTTP query endpoints and forwarded by the PostgreSQL proxy.

## SQLite compatibility evidence

The PizzaSQL repository includes the SQLite SQLLogicTest corpus and a custom runner. The corpus provides broad query coverage, but it does not currently prove complete SQLite compatibility:

- SQLite-specific conditional cases are not all selected correctly by the runner.
- Some executor and storage integration tests skip when PizzaKV is unavailable.
- The default SQLLogicTest target exercises HTTP rather than the PostgreSQL wire protocol.
- There is no committed CI result artifact supporting a 100% compatibility claim.

Compatibility claims should therefore be tied to explicit automated tests, not only to the presence or size of the corpus.

## Advice for porting

1. Use explicit `INNER`, `LEFT`, and `CROSS` joins with `ON` conditions.
2. Enforce uniqueness, checks, and referential integrity in the application until engine enforcement lands.
3. Use a single-column primary key.
4. Avoid `AUTOINCREMENT`, expression defaults, and `DEFAULT CURRENT_TIMESTAMP` for semantic behavior.
5. Use `COUNT`, `SUM`, `AVG`, `MIN`, and `MAX`; verify other functions against the [function reference](/sql-reference/functions/).
6. Test your exact driver and migration tool before deploying an application.

## Compatibility policy

- A feature is marked Supported only when parser, executor, storage, and public connection-path tests pass.
- Features that parse without enforcing their semantics are marked Unsafe.
- Unsupported features should fail clearly rather than silently producing a different result.
- Every compatibility regression should receive a test before it is fixed.
- This matrix should change in the same release as the behavior it describes.
