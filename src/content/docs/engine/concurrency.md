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

The locks protecting these structures are implementation locks. They are separate from SQL row locks and from the optimistic commit gate. Different databases use separate managers and caches.

## Connection and executor topology

- **PostgreSQL wire server:** each connection has its own executor and transaction session, while database managers and storage are shared.
- **Engine HTTP server:** each request gets a fresh executor sharing the selected database's schema/table managers. Explicit engine HTTP transactions are identified by a `transactionId` and use their own session executor. The managed HTTP query endpoints reject transaction-control statements.
- An executor owns mutable session state and is not shared concurrently between connections or requests.

This allows separate connections to issue statements concurrently while keeping each transaction's staged mutations session-local.

## Statement atomicity

Scan-based `UPDATE` and `DELETE`, primary-key moves, and DML with `RETURNING`
stage the complete statement before one compare-batch commit. Predicate,
assignment, constraint, encoding, or RETURNING evaluation errors leave no partial
statement effects. Inside an explicit transaction, only the failed statement's
staged mutations are rolled back; PostgreSQL ERROR handling still requires
transaction recovery before further commands.

A proven single-row operation without RETURNING can keep the direct point-CAS
path. Neither path weakens fsync or divides one atomic statement into separately
committed chunks. If the storage operation/read-set or byte limit is exceeded,
the operation fails rather than partially committing.

## In-memory caches and their invalidation

Several caches live in memory per `TableManager`/`SchemaManager` and affect observable behaviour:

- **Row-key cache** (`rowKeyCache`): maps hidden rowids to durable primary keys for indexed lookups; it does not cache every row value.
- **Index entry cache** (`indexCache`): value→rowids mappings, built lazily (see [Indexes](/engine/indexes/)). Row values are still fetched from KV for matching keys.
- **Count cache**: an exact derived row count used by the narrow `COUNT(*)` fast path.
- **Schema cache**: table/index definitions, invalidated by DDL.

Point writes update warm in-memory index entries. Current source builds prepare
and apply column-index/count deltas for commits holding an exclusive table gate.
Shared-gate optimistic commits still invalidate read caches, avoiding out-of-order
cache publication across concurrent durable CAS operations. Expression read
indexes are invalidated rather than assuming evaluator determinism. DDL, restart,
and ambiguous write outcomes can also require a rebuild.

Column UNIQUE ownership caches use a separate constraint encoder and actual
durable row keys. They are validated under the exclusive gate and updated only
after durable success; expression UNIQUE constraints retain scan validation.

Implications:

- A cold index lookup pays a full table read to build its derived mapping. Ordinary unindexed scans read KV pages; they are not served by an all-row value cache.
- Because managers are shared per database, writes invalidate affected caches and schema-version changes cause executors to refresh analyzer metadata.

## KV publication and scan work

Acknowledgment still follows fsync and publication. Unconditional KV writes can
coalesce into one durable group; conditional compare-batches remain independent
and skip the coalescing wait because they cannot share that fsync. Compare checks
reuse GET's mapped exact-key reader with a file-read fallback—hash equality alone
never establishes key equality.

SCAN captures page-bounded immutable journal references and at most 64 KiB of
short-key bytes under the shared publication gate. Response allocations and value
reads happen after unlock, without borrowing tree nodes that deletes can free.
The append-only journal keeps captured records valid, just as for GET/MULTI_GET;
a future reclaiming compactor would need reader pinning.

These optimizations do not change storage format, durability, transaction size
limits, or the need to handle `40001`.

## No MVCC — what that means

- There is no PostgreSQL-style snapshot isolation for long-running reads.
- Row locks are **optimistic**: `SELECT ... FOR UPDATE`/`FOR SHARE` holds a lock and protects the row, but a writer that conflicts with it fails its commit with `40001` instead of blocking. There are no gap or predicate locks.
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

`SELECT ... FOR UPDATE` and `FOR SHARE` are supported on a single base table, with `NOWAIT` (SQLSTATE `55P03`) and `SKIP LOCKED`. A locking read acquires a per-row lock, re-reads the row after acquiring it, and re-checks the `WHERE` predicate. Locks are held until `COMMIT`/`ROLLBACK`; an autocommit locking SELECT releases at statement end. Deadlocks between blocking lock waiters return `40P01`.

The lock is **optimistic on the writer side**. PizzaSQL does not make a conflicting `UPDATE`/`DELETE` wait: a commit that writes a row locked by another transaction fails with `40001`, and the application retries. The lock holder itself is protected, so another worker cannot commit over its row. Two consequences follow:

- There are no gap or predicate locks. An `INSERT` that would match a locked range is not blocked, and a locking read does not prevent phantoms.
- Locks are in-process. One PizzaSQL process per database is the supported deployment shape.

This is enough for a queue claim loop:

```sql
BEGIN;
SELECT id FROM jobs
 WHERE status = 'pending'
 ORDER BY id
 LIMIT 1
 FOR UPDATE SKIP LOCKED;
UPDATE jobs SET status = 'processing' WHERE id = ...;
COMMIT;
```

Keep the claim transaction short. A worker that holds a lock open while calling an external service delays other workers and can force writer retries. `ROLLBACK TO SAVEPOINT` does not release locks acquired after the savepoint; they remain held until the transaction ends (stricter than PostgreSQL).

### Safe claim patterns

The following patterns remain useful when row locks are unavailable or when the workload must avoid holding a lock:

- **Atomic compare-and-set:** `UPDATE jobs SET owner = ?, state = 'claimed' WHERE id = ? AND state = 'pending'`; a `rows_affected` of `1` means this worker owns the job, `0` means another worker won. This is a single statement, so it is atomic without row locks.
- **Unique-index arbitration:** insert a row into a `UNIQUE` table and treat `23505` as "already claimed". Pair it with `ON CONFLICT DO NOTHING` to make the probe non-throwing.
- **Optimistic version column:** read `version`, write `WHERE id = ? AND version = ?`, and retry on `rows_affected = 0`. Do not hold a transaction open across user think-time.
- **Leases:** store `lease_until`; a reclaim is an `UPDATE ... WHERE lease_until < now()`, which is again a single atomic statement. Clock skew makes this approximate; prefer a server-generated timestamp if it matters.

If a workflow genuinely needs to hold a row while calling an external service, prefer a state machine with short transactions; a `FOR UPDATE` lock across that call is possible, but it blocks other claimers and can cause writer retries.

## Practical guidance

- Keep transactions short to reduce conflicts and the amount of work discarded by a retry.
- Retry SQLSTATE `40001` with bounded backoff.
- Do not expect PostgreSQL isolation levels, MVCC snapshots, or gap/predicate locking.
- Assume the first access after a cold start or a fresh connection is slower (cold caches); warm caches are fast.
- Treat each database as a separate storage and cache domain.
