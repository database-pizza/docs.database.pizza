---
title: Concurrency
description: How PizzaSQL combines concurrent statements, shared caches, and optimistic transaction validation without PostgreSQL MVCC.
---

PizzaSQL supports concurrent statements and optimistic DML transactions. It does not implement PostgreSQL MVCC, snapshots, or row-level locks. Instead, a transaction records the versions and generations it observes, stages its writes, and validates those observations during commit.

## Transaction conflicts

Every stored value has a logical sequence number (LSN). Transactions also observe table and predicate generations where a scan could be affected by inserted or deleted rows.

At commit, PizzaSQL sends the observed versions and staged writes to PizzaKV as one compare-and-batch request:

- If the comparisons still match, the batch is committed and the new values become visible.
- If a row or relevant table generation changed, commit fails with a serialization conflict.
- Callers using the PostgreSQL wire protocol receive SQLSTATE `40001` and can retry the transaction.

An open transaction therefore does not take a database-wide lock for its full lifetime. Other sessions can continue to read and write, with conflicting commits resolved through validation.

## What is shared

Executors for the same database share storage-backed schema and table managers. Those managers protect mutable in-memory state such as:

- Schema and index definitions
- Catalog version information
- Lazily populated row and index caches
- Row-ID allocation state

The locks protecting these structures are implementation locks, not SQL row locks or user-visible transaction locks. Different databases use separate managers and caches.

## Connection and executor topology

- **PostgreSQL wire server:** each connection has its own executor and transaction session, while database managers and storage are shared.
- **HTTP server:** requests use the executor associated with the selected database. The managed HTTP query endpoints reject transaction-control statements.

This allows separate connections to issue statements concurrently while keeping each transaction's staged mutations session-local.

## In-memory caches and their invalidation

Several caches live in memory per `TableManager`/`SchemaManager` and affect observable behaviour:

- **Row cache** (`rowCache` / `rowIDMap`): a table's rows, loaded lazily on first `SELECT`. A `SELECT` reads from storage once, then serves from cache until a write invalidates the table.
- **Index entry cache** (`indexCache`): value→rowids mappings, built lazily (see [Indexes](/engine/indexes/)).
- **Schema cache**: table/index definitions, invalidated by DDL.

Writes (`INSERT`/`UPDATE`/`DELETE`) invalidate the affected table's row cache and update any warm in-memory index entries. A table-level or index-level write is a full invalidation, not a per-row patch.

Implications:

- The first query against a table in a fresh connection (or after a restart) pays a full read of that table from storage.
- Because managers are shared per database, writes invalidate affected caches and schema-version changes cause executors to refresh analyzer metadata.

## No MVCC — what that means

- There is no PostgreSQL-style snapshot isolation for long-running reads.
- There are no row-level locks and no `SELECT ... FOR UPDATE`, `NOWAIT`, or deadlock detection.
- Transaction write and phantom conflicts are detected through observed LSNs and table or predicate generations at commit.

## Thread safety and the KV layer

Below the SQL layer, a **connection pool** to the PizzaKV key-value store fans out individual key operations. Pool connections are checked out per operation and returned afterward; a timeout or short read on a pooled connection closes it and replaces it rather than reusing a possibly-corrupt connection. This is internal detail, but it means key-value I/O is safe to issue from many goroutines (e.g. `INSERT ... SELECT` writes rows concurrently).

## Isolation guarantees

The model is **optimistic serialization at commit**, not snapshot isolation:

- A transaction observes rows and table/predicate generations as it reads. At commit, PizzaKV applies the staged writes only if every observed version still matches; otherwise the commit fails with SQLSTATE `40001` and nothing from the batch is written.
- Concurrent writers to the **same row** cannot both commit: one wins, the other gets `40001` and must retry.
- Concurrent inserts and deletes that a scanned predicate would have seen bump a predicate generation, so a transaction that decided something from a scan is invalidated by a conflicting insert/delete and also gets `40001`. This covers the common phantom case without MVCC.
- **Write skew is possible.** Two transactions can read overlapping sets, write disjoint rows, and both commit, producing a state no serial order would allow. There are no predicate locks to prevent this. If a business invariant spans rows that different transactions write, enforce it with a single atomic statement (`UPDATE ... WHERE invariant`, `INSERT ... ON CONFLICT`) or serialize those transactions through one contended row.
- Long-running reads do not hold a snapshot. Each statement sees the latest committed state plus the transaction's own staged writes, so re-reading a row inside a transaction can return a different value than the first read.
- DDL is not transactional and is never rolled back by `ROLLBACK`.

## Retry recipe

Treat `40001` as retryable and retry the **whole transaction** with bounded exponential backoff and jitter. Do not retry a single statement inside a transaction: its reads are no longer a valid basis for the commit.

```text
for attempt in 0..max_attempts:
    BEGIN
    ... reads and writes ...
    COMMIT
    on SQLSTATE 40001:
        ROLLBACK (ignore "no transaction in progress")
        sleep(base * 2^attempt + jitter)
        continue
    on success: return
```

Keep each attempt short, cap the total retry budget, and surface a permanent failure after the cap. HTTP clients see the same class as `409` with `"code": "40001"`; PostgreSQL clients see `40001`.

## Row locks

There are no row locks. `SELECT ... FOR UPDATE`, `FOR SHARE`, `FOR NO KEY UPDATE`, `NOWAIT`, and `SKIP LOCKED` are rejected with SQLSTATE `0A000` instead of being accepted without locking. Do not build a queue or claim loop that depends on `FOR UPDATE SKIP LOCKED`.

### Safe claim patterns

- **Atomic compare-and-set:** `UPDATE jobs SET owner = ?, state = 'claimed' WHERE id = ? AND state = 'pending'`; a `rows_affected` of `1` means this worker owns the job, `0` means another worker won. This is a single statement, so it is atomic without row locks.
- **Unique-index arbitration:** insert a row into a `UNIQUE` table and treat `23505` as "already claimed". Pair it with `ON CONFLICT DO NOTHING` to make the probe non-throwing.
- **Optimistic version column:** read `version`, write `WHERE id = ? AND version = ?`, and retry on `rows_affected = 0`. Do not hold a transaction open across user think-time.
- **Leases:** store `lease_until`; a reclaim is an `UPDATE ... WHERE lease_until < now()`, which is again a single atomic statement. Clock skew makes this approximate; prefer a server-generated timestamp if it matters.

If a workflow genuinely needs to hold a row while calling an external service, redesign it as a state machine with short transactions rather than waiting for row locks.

## Practical guidance

- Keep transactions short to reduce conflicts and the amount of work discarded by a retry.
- Retry SQLSTATE `40001` with bounded backoff.
- Do not expect PostgreSQL isolation levels, row locks, or MVCC snapshots.
- Assume the first access after a cold start or a fresh connection is slower (cold caches); warm caches are fast.
- Treat each database as a separate storage and cache domain.
