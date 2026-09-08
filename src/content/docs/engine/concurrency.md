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

## Practical guidance

- Keep transactions short to reduce conflicts and the amount of work discarded by a retry.
- Retry SQLSTATE `40001` with bounded backoff.
- Do not expect PostgreSQL isolation levels, row locks, or MVCC snapshots.
- Assume the first access after a cold start or a fresh connection is slower (cold caches); warm caches are fast.
- Treat each database as a separate storage and cache domain.
