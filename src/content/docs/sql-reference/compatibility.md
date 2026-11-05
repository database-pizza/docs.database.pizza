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

## Engine build and capability discovery

Every managed PostgreSQL endpoint reports three separate identities so a client can pin behavior:

| Surface | Value |
| --- | --- |
| `server_version` ParameterStatus / `SHOW server_version` / `version()` | PostgreSQL compatibility string (`14.0 (PizzaSQL)`) |
| `pizzasql.version` and `pizzasql.commit` ParameterStatus | the real engine build and source commit |
| `SELECT pizzasql_version()` | the engine build, independent of the PostgreSQL compatibility string |
| `GET /version` on the engine HTTP API | `version`, `commit`, `date`, `postgres_compat`, and `sqlite_compat` |
| `GET /capabilities` on the engine HTTP API | machine-readable capability document (`schema_version`, constraints, DDL, transactions, types, parameters, JSON, error codes, docs links) |

The capability document is versioned by its own `schema_version` and names the engine `engine_version` it describes. The pg-wire build identity and the engine HTTP document are the sources of truth; use them to delete version-specific workarounds rather than sniffing `server_version`.

Compatibility is versioned with each docs release: a release note records the PizzaSQL build, and the compatibility page and capability document for that build are published together. Behavior that clients can observe follows semantic versioning — removals and semantic changes require a major release, additive capabilities a minor release, and fixes a patch release. A behavior change is announced in the release notes, the capability document is updated in the same release, and the old behavior is deprecated for at least one minor release before removal. Client-visible SQLSTATE codes are part of the contract and are not changed in a patch release.

The engine repository also runs a pChat-style compatibility suite (`make compat`) on every CI run. It covers DDL, upsert idempotency, UNIQUE enforcement, pagination, parameters, transaction state, and error codes; results are published as a CI artifact. Release tags run it in strict mode, where a missing documented capability fails the gate.

### Correctness fixes in current source builds

Recent source builds fix indexed equality/NULL evaluation and qualified JOIN
predicate binding, validate `NOT NULL` after defaults and assignments (`23502`),
and stage scan-based mutations and DML `RETURNING` before atomic publication.
Failed evaluation must not leave earlier rows from that statement committed.
Storage transaction limits still apply: a statement too large for one atomic
batch fails instead of being split into independent commits.

These are source-build guarantees, not a claim that every hosted tenant has
been upgraded. App deployment and tenant engine approval/promotion are separate.
Use the engine identity and capability document to identify the running build.

## Positioning

| Dimension | PizzaSQL |
| --- | --- |
| SQL dialect | SQLite-inspired, with documented differences |
| Wire protocol | Partial PostgreSQL v3 simple and extended query protocols; Describe returns compatibility NoData, binary results are supported for the OIDs in `/capabilities`, and portals are resumable with bounded `Execute` |
| Type system | Dynamic values with partial SQLite-style affinity |
| Storage | Versioned binary rows in PizzaKV |
| Transactions | Optimistic compare-batch DML transactions; DDL is non-transactional |
| Planner | Heuristic index selection, otherwise scans |

## Important limitations

Do not rely on the following behavior yet:

- `CHECK` constraints are enforced on the core write paths (SQLSTATE `23514`; NULL/unknown passes) and are restricted to deterministic, subquery-free expressions over unqualified row columns. Foreign keys are enforced (SQLSTATE `23503`); the parent columns must be a primary key or unique index, composite keys follow `MATCH SIMPLE`, and `CASCADE`/`SET NULL`/`SET DEFAULT` are supported while `DEFERRABLE` is not. `UNIQUE` constraints and unique indexes are enforced on the core write paths under the table publication gate. Current builds retain rebuildable column-ownership caches; expression constraints still scan. Definitions and row data persist, not native durable index pages. This does not imply full SQLite or PostgreSQL concurrency semantics. `UNIQUE` is materialized only when a table is created; tables created before this support are not retroactively enforced after an upgrade.
- Composite primary keys (`PRIMARY KEY (a, b)`) are supported; key columns are implicitly `NOT NULL` and a missing component returns `23502`.
- Column defaults accept constants and the clock whitelist (`CURRENT_TIMESTAMP`, `CURRENT_DATE`, `CURRENT_TIME`, `datetime('now')`, `date('now')`, `time('now')`), evaluated once per statement at write time. Other non-constant defaults are rejected with `0A000`.
- One-dimensional arrays are supported for `TEXT[]`, `VARCHAR(n)[]`, `INTEGER[]`, `BIGINT[]`, `SMALLINT[]`, `BOOLEAN[]`, `REAL[]`, `DOUBLE PRECISION[]`, and `NUMERIC[]`. `expr = ANY(array)` and `expr <> ALL(array)` follow three-valued logic. Multidimensional arrays, other element types, and scalar `unnest` are rejected with `0A000`. Array parameters are accepted in text form and in PostgreSQL binary form for the supported element types; see [Statements](/sql-reference/statements/).
- `SELECT ... FOR UPDATE` and `NOWAIT`/`SKIP LOCKED` are rejected with `0A000`; transactions are optimistic and have no row locks.
- `RIGHT JOIN`, `FULL JOIN`, `JOIN ... USING`, and `NATURAL JOIN` may parse but do not execute correctly.
- DDL executed inside an explicit transaction is staged and reverted by `ROLLBACK`; autocommit DDL applies immediately.
- Result column type metadata is reported for direct projections and common expressions (aggregates, comparisons, literals, CASTs); derived tables and CTEs still fall back to `TEXT`.

Unsupported syntax normally returns an error. The items above are called out separately because accepting syntax without enforcing its semantics can cause incorrect application behavior.

## Queries

| Capability | PizzaSQL | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| Basic `SELECT`, expressions, and aliases | Supported | Supported | Supported |
| `WHERE` | Supported | Supported | Supported |
| `DISTINCT` | Supported | Supported | Supported |
| `ORDER BY`, `LIMIT`, and `OFFSET` | Supported | Supported | Supported |
| `ORDER BY ... NULLS FIRST/LAST` | Supported | Supported | Supported |
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
| Common table expressions (`WITH`) | Supported | Supported | Supported |
| Recursive common table expressions | Supported | Supported | Supported |
| Window functions | Partial; `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)` only | Supported | Supported |

## Writes

| Capability | PizzaSQL | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| Single-row and multi-row `INSERT` | Supported | Supported | Supported |
| `INSERT ... SELECT` | Supported | Supported | Supported |
| `UPDATE` | Supported | Supported | Supported |
| `DELETE` | Supported | Supported | Supported |
| `INSERT OR IGNORE`, `REPLACE`, and related SQLite conflict modes | Supported | Supported | Different syntax |
| `ON CONFLICT DO NOTHING` | Supported for primary-key and unique-index targets | Supported for unique constraints | Supported for unique constraints |
| `ON CONFLICT DO UPDATE` | Supported for primary-key and unique-index targets, including `excluded` | Supported for unique constraints | Supported for unique constraints |
| `RETURNING` | Supported for `INSERT`, `UPDATE`, and `DELETE` | Supported since 3.35 | Supported |
| `TRUNCATE` | Unsupported | Unsupported | Supported |

## Schema and constraints

| Capability | PizzaSQL | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| `CREATE TABLE` and `DROP TABLE` | Supported | Supported | Supported |
| `CREATE TABLE IF NOT EXISTS` | Supported | Supported | Supported |
| `ALTER TABLE ADD/DROP/RENAME` | Partial; ADD with a constant default backfills rows, DROP rewrites rows, RENAME rewrites plain-column index metadata and rejects renames an expression index depends on | Partial | Supported |
| Altering column type, default, or nullability | Unsupported | Limited | Supported |
| `CREATE INDEX` and `DROP INDEX` | Partial; indexes are rebuilt from stored rows | Supported | Supported |
| `CREATE INDEX IF NOT EXISTS` | Supported in current source; deployed versions may differ | Supported | Supported |
| Views | Partial; not persisted across executor restarts | Persistent | Persistent |
| Triggers | Unsupported | Supported | Supported |
| Single-column primary keys | Supported | Supported | Supported |
| Composite primary keys | Supported; key columns are `NOT NULL`, encoding is column-ordered, and assigning a key column in `ON CONFLICT DO UPDATE` is rejected | Supported | Supported |
| `NOT NULL` | Supported on final insert/update rows; `23502` on current builds | Supported | Supported |
| `UNIQUE` constraints | Enforced on core write paths; cached column ownership / expression validation, with legacy-table and transaction caveats | Supported | Supported |
| Unique indexes | Enforced on core write paths; derived ownership cache for columns, scans for expressions | Supported | Supported |
| `CHECK` constraints | Supported; enforced with `23514`, deterministic single-row expressions only | Supported | Supported |
| Foreign keys | Supported; `23503`, parent must be PK/unique, `MATCH SIMPLE`, `CASCADE`/`SET NULL`/`SET DEFAULT`, no `DEFERRABLE` | Supported when enabled | Supported |
| Literal defaults | Supported (constant values) | Supported | Supported |
| Expression defaults | Supported for constants and the clock whitelist (evaluated once per statement); other expressions rejected with `0A000` | Supported | Supported |
| `DEFAULT CURRENT_TIMESTAMP` | Supported; evaluated once per statement at write time | Supported | Supported |
| Array parameters and `ANY`/`ALL` | Supported, one-dimensional only; text and binary element formats for int2/int4/int8/bool/float4/float8/text/varchar/numeric | Not applicable | Supported |
| `AUTOINCREMENT` | Partial; accepted without distinct SQLite semantics | Supported | Not applicable |
| Identity and serial columns | Unsupported | Not applicable | Supported |
| Generated columns | Unsupported | Supported | Supported |
| Implicit `rowid` | Supported; `rowid`/`oid`/`_rowid_` are `BIGINT` over the wire and form a keyset cursor when auto-assigned | Supported | Unsupported |

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
| JSON values and functions | Supported as text plus the JSON1 function set and the `->`/`->>` operators; no binary `JSONB` | Available with SQLite JSON support | Supported with `JSON` and `JSONB` |
| Arrays, UUIDs, enums, and intervals | Partial; `UUID` is accepted as a text alias with no native PostgreSQL UUID semantics | Unsupported as native types | Supported |
| `CAST` to integer, real, and text | Supported | Supported | Supported |
| Other `CAST` targets | Partial; many targets are no-ops | Affinity based | Strictly typed |
| PostgreSQL `::` casts | Unsupported | Unsupported | Supported |
| SQL three-valued NULL logic | Supported | Supported | Supported |
| `LIKE` | Supported; case-insensitive | Case-insensitive by default | Case-sensitive; `ILIKE` is separate |
| Collations | Unsupported | Supported | Supported |
| Bitwise, regular-expression, and JSON operators | Partial; `->` and `->>` are supported, bitwise and regex are not | Partial | Supported |

## Functions

| Capability | PizzaSQL | SQLite | PostgreSQL |
| --- | --- | --- | --- |
| `COUNT`, `SUM`, `AVG`, `MIN`, and `MAX` | Supported | Supported | Supported |
| `COUNT(DISTINCT ...)` | Supported | Supported | Supported |
| `GROUP_CONCAT` | Supported, including `DISTINCT` and a custom separator | Supported | Use `STRING_AGG` |
| `STRING_AGG(expr, delimiter)` | Supported for text values and `DISTINCT`; no aggregate-internal `ORDER BY`; `NULL` delimiter yields `NULL` | Unsupported | Supported |
| `CONCAT_WS`, `JSON_ARRAY_LENGTH`, `PG_BACKEND_PID` | Supported | `CONCAT_WS` only | Supported |
| `TOTAL` | Supported; returns `0` on an empty set | Supported | Unsupported |
| Common string functions | Partial | Supported | Supported |
| Common math functions | Partial | Supported | Supported |
| `CEIL`, `FLOOR`, and `MOD` | Unsafe; declared but currently return `NULL` | Supported | Supported |
| SQLite date and time functions | Supported | Supported | Different function set |
| `last_insert_rowid()`, `changes()`, `total_changes()` | Supported; session-local | Supported | Unsupported |
| PostgreSQL date and time functions | Unsupported | Unsupported | Supported |
| JSON functions | Supported: JSON1 over `TEXT`/`JSON`, plus native `JSONB` (canonical storage, OID 3802, `->` `->>` `#>` `#>>` `@>` `<@` `?` `?\|` `?&` `\|\|` `-` `#-`, and `jsonb_*` functions); no jsonpath or GIN | Available with SQLite JSON support | Supported |
| Window functions | Partial; `ROW_NUMBER()` only | Supported | Supported |

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
| Binary results | Supported for bool, integers, floats, text, bytea, jsonb, and one-dimensional arrays; other OIDs and unrepresentable values fail cleanly | Not applicable | Supported |
| Correct result type OIDs | Partial; single-table direct column projections report typed OIDs, expressions and joins report `TEXT` | Not applicable | Supported |
| PostgreSQL TLS | Supported when the managed proxy is configured with a certificate; sslmode contract below | Not applicable | Supported |
| PostgreSQL SCRAM and MD5 authentication | Unsupported | Not applicable | Supported |
| `information_schema` | Partial emulation | Unsupported | Supported |
| `pg_catalog` | Unsupported | Unsupported | Supported |
| Query cancellation | Unsupported | Not applicable | Supported |
| `COPY` | Unsupported | Not applicable | Supported |
| `LISTEN` and `NOTIFY` | Supported; no durable replay | Not applicable | Supported |
| Node.js `pg` | Basic use verified | Not applicable | Supported |
| psycopg, pgx, and lib/pq | Unverified | Not applicable | Supported |
| ORMs and migration frameworks | Unverified | Varies | Supported |
| `psql` schema introspection commands | Partial | Not applicable | Supported |

Because the wire is PostgreSQL-compatible, drivers may issue introspection queries such as `information_schema`, `pg_catalog`, `SELECT version()`, or `SHOW server_version` on connection. PizzaSQL emulates a small subset of these so basic clients can start. SQLite-style migrators are also accommodated with a read-only `sqlite_master`/`sqlite_schema` emulation and the `index_list`, `index_info`, and `table_xinfo` pragmas. See [PostgreSQL protocol](/internals/postgres-protocol/).

## Managed service differences

The managed database.pizza proxy layers additional behavior on top of PizzaSQL:

- API keys with `read`, `write`, `alter_table`, and `drop_table` scopes gate statements.
- Channel operations require `listen:<pattern>` and `notify:<pattern>` scopes; see [Notifications](/sql-reference/notifications/).
- Updated proxies relay scope errors to engines advertising `pizzasql.proxy_errors=1`, returning `42501` and preserving failed-transaction/Sync recovery. With an older engine, the updated proxy fails closed with FATAL `42501` and disconnects; reconnect is required. See [PostgreSQL protocol](/internals/postgres-protocol/).
- PostgreSQL TLS terminates at the managed proxy when `PGPROXY_TLS_CERT`/`PGPROXY_TLS_KEY` are configured. `PGPROXY_TLS_MODE=optional` (the default with a certificate) offers TLS while keeping `sslmode=disable` clients working; `required` rejects plaintext startup with `08P01`; `off` disables TLS. Clients can use `sslmode=require` (or `verify-full` with a trusted, hostname-matching certificate). If a deployment has not installed certificates, `SSLRequest` is declined and only `sslmode=disable` connects; use that only over a trusted hop. TLS ends at the proxy — the loopback hop to PizzaSQL is plaintext.
- Exhausting the per-organization connection quota returns SQLSTATE `53300` with the current/limit numbers and a retry hint. Quota and idle-connection behavior are documented in [Limits & quotas](/guides/limits/#connections-and-idle-disconnects).
- The PostgreSQL database name is `org/db`; the slash must be percent-encoded in a URI.
- Transaction statements are rejected by the managed HTTP query endpoints and forwarded by the PostgreSQL proxy.

## SQLite compatibility evidence

The PizzaSQL repository includes the SQLite SQLLogicTest corpus and a custom runner. The corpus provides broad query coverage, but it does not currently prove complete SQLite compatibility:

- SQLite-specific conditional cases are not all selected correctly by the runner.
- Some executor and storage integration tests skip when PizzaKV is unavailable.
- The default SQLLogicTest target exercises HTTP rather than the PostgreSQL wire protocol.
- There is no committed CI result artifact supporting a 100% compatibility claim.

Compatibility claims should therefore be tied to explicit automated tests, not only to the presence or size of the corpus.

## Experimental backend evidence

The integration suites below are **local source-build verification**, not evidence that every hosted tenant runs that build. The workspace also dogfoods adapted Gogs and Vikunja forks on its managed stack; those are operator-owned deployments, not proof of unmodified upstream compatibility. PostgreSQL proxy TLS is supported in source, but the public endpoint returned `N` to a credential-free SSLRequest on 2026-11-04. Prefer HTTPS/MCP until public PostgreSQL TLS is installed; see [Connect](/getting-started/connect/).

### Gogs

An experimental Gogs fork drives PizzaSQL through a custom `pgx`-backed `database/sql` driver that emits SQLite-dialect SQL over the PostgreSQL wire. Its opt-in smoke test passes end to end against local engine binaries, covering:

- Full fresh-start schema installation and table creation through GORM and XORM, migrations seeding, and XORM `Sync2`.
- The install flow end to end: `GET /install` returns `200`, `POST /install` redirects with `302`, and the admin user is inserted and reachable through `/user/login`.
- User, repository, access-token, and permission writes through the public stores, cross-ORM reads, uniqueness rejection, and transaction rollback.
- Pool close/reopen and full engine-process plus PizzaKV restart against the same `.pkvdb` file, confirming installation and persistence.
- Core LFS object metadata: multiple objects per repository, the same OID in a different repository kept distinct, duplicate `(repo_id, oid)` rejection, and reads back with a real `time.Time` `created_at`.

This is **not** evidence of complete Gogs compatibility or of the Git LFS transfer path — actual Git LFS upload, SSH, and push have not been tested yet, and the full Gogs test suite has not passed against PizzaSQL.

### Vikunja

An experimental Vikunja fork uses the same driver shape (a `database/sql` driver plus an XORM dialect mapping) but exercises a larger schema and different queries. Its full migration suite ran against a local engine, and registration, login, project CRUD, and task CRUD — create, update, list, delete, and the notification path — worked through the HTTP API. Supporting it required engine work for:

- Non-recursive and recursive common table expressions.
- `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)`.
- `ORDER BY ... NULLS FIRST/LAST`.
- `ON CONFLICT (cols) DO UPDATE` on unique indexes, including `excluded`.
- Correlated `EXISTS` in a single-table `WHERE`.

There is no committed automated Vikunja integration test yet, so this is a manual validation rather than a repeatable gate.

## Advice for porting

1. Use explicit `INNER`, `LEFT`, and `CROSS` joins with `ON` conditions.
2. Enforce checks and referential integrity in the application. Uniqueness is enforced on the core write paths, but keep application-level checks for anything with stricter concurrency or DDL needs.
3. Prefer a single-column primary key when you have a choice; composite keys are supported with the limits listed above.
4. Avoid `AUTOINCREMENT` for semantic behavior. A `DEFAULT CURRENT_TIMESTAMP` or `datetime('now')` is evaluated once per statement, not per row.
5. Use `COUNT`, `SUM`, `AVG`, `MIN`, and `MAX`; verify other functions against the [function reference](/sql-reference/functions/).
6. Test your exact driver and migration tool before deploying an application.

## Compatibility policy

- A feature is marked Supported only when parser, executor, storage, and public connection-path tests pass.
- Features that parse without enforcing their semantics are marked Unsafe.
- Unsupported features should fail clearly rather than silently producing a different result.
- Every compatibility regression should receive a test before it is fixed.
- This matrix should change in the same release as the behavior it describes.
