---
title: Transactions
description: How PizzaSQL stages DML, detects concurrent changes, and commits with an optimistic compare-and-batch transaction model.
---

PizzaSQL supports `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`, and `ROLLBACK TO SAVEPOINT` for data manipulation. Transactions stage writes in the session and validate observed data when committing. This is not PostgreSQL MVCC, and schema changes are not transactional.

## The model: staged writes and optimistic validation

A transaction maintains a session-local overlay:

1. Reads consult staged writes and deletes first, which provides read-your-writes behavior.
2. Reads remember the row versions and table or predicate generations they observed.
3. Inserts, updates, and deletes remain staged until `COMMIT`.
4. `COMMIT` submits the comparisons and writes as one compare-and-batch operation to PizzaKV.

If observed data changed before commit, validation fails with a serialization conflict instead of overwriting the concurrent change. `ROLLBACK` discards the staged overlay without applying it to storage.

## Transaction control

```sql
BEGIN;                 -- or BEGIN TRANSACTION
UPDATE accounts SET balance = balance - 100 WHERE name = 'alice';
UPDATE accounts SET balance = balance + 100 WHERE name = 'bob';
COMMIT;
```

```sql
BEGIN;
INSERT INTO log VALUES (1);
SAVEPOINT sp1;
INSERT INTO log VALUES (2);
ROLLBACK TO sp1;       -- undoes the second insert
RELEASE sp1;
COMMIT;                -- keeps the first insert
```

- `BEGIN` inside an open transaction is an error.
- `COMMIT`/`ROLLBACK` with no open transaction is an error.
- `SAVEPOINT` outside a transaction implicitly opens one.
- `ROLLBACK TO name` discards staged operations back to the savepoint and removes savepoints created after it.
- `RELEASE name` removes a savepoint; releasing the outer-most savepoint has no effect on the transaction.

## Guarantees and limitations

- **DML is staged until commit.** An open transaction's data writes are visible to that session through its overlay and are not published as independent storage operations.
- **Conflicts are optimistic.** Another connection can continue working while a transaction is open. A transaction that observed stale rows or table generations can fail at commit and should be retried.
- **DDL is not transactional.** `CREATE TABLE`, `DROP TABLE`, `ALTER TABLE`, `CREATE INDEX`, and `DROP INDEX` write through the schema manager rather than the transaction overlay. Rolling back does **not** undo DDL executed inside a transaction.
- **This is not MVCC.** PizzaSQL does not provide PostgreSQL snapshots, row locks, or the full PostgreSQL isolation-level model.

## Failed transactions over the wire

On the PostgreSQL protocol, the connection tracks transaction state. If a statement inside a transaction block errors:

- The connection enters a "failed transaction" state and rejects further commands with SQLSTATE `25P02` until the client sends `ROLLBACK` (or `ROLLBACK TO SAVEPOINT`).
- This mirrors PostgreSQL's aborted-transaction behaviour.

## Managed service restrictions

- The **managed HTTP query and execute endpoints reject transaction statements** (`BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`) with `501 Not Implemented`, and the `/execute` endpoint's `transaction: true` flag is rejected too. Use the PostgreSQL wire protocol if you need transactions on the managed service.
- The **managed PostgreSQL proxy** forwards transaction statements to the engine, so transactions work normally over `psql`/drivers.
- The engine's own raw HTTP API and CLI do support transaction statements, but those surfaces are internal to the platform.

## Practical guidance

- Keep transactions short to reduce the chance of a serialization conflict.
- Do not rely on rolling back DDL — migrate schema outside of transactions, or test-and-recover manually.
- Retry a transaction when the PostgreSQL connection returns SQLSTATE `40001`.
- Prefer the PostgreSQL connection path for anything that needs multi-statement atomicity on the managed service.
