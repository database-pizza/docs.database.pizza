---
title: Change history
description: Inspect recorded row and schema changes, compare earlier values, and understand what changed in a small or AI-built application.
---

database.pizza derives data and schema history from its storage journal, so you can answer questions like "what did this row look like earlier?", "when was this table created?", and "what changed after that agent ran?" This page explains what history exists, where to see it, and its limits.

## What history is recorded

Every write that changes your database lands in a **write-ahead journal** (the PizzaKV WAL). Each journal record captures a single key/value operation — either a **write** (`W`) that creates or replaces a value, or a **delete** (`D`) that removes one. Replaying these records in order reconstructs the state of your database at any position in the journal.

Because the journal is keyed by the same namespaces described in [Storage model](/internals/storage/), history naturally breaks into a few scopes:

| Scope | What it tracks | Example |
| --- | --- | --- |
| `data` | Row-level changes | An `INSERT`, `UPDATE`, or `DELETE` on a table row |
| `schema` | Table definitions | `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE` |
| `index` | Index definitions | `CREATE INDEX`, `DROP INDEX` |
| `sys` | Catalog and structural state | The table list and rowid counters |

## Inspecting row history

For an identifiable row you can inspect its available **before/after history**: recorded operations that touched its key, their journal positions, and the values immediately before and after each operation.

- **Row changes** show you the previous and next value of the row keyed by its primary key, so you can trace exactly how a record drifted over time.
- **Deletes** show you the row that was removed, so a mistakenly deleted record is recoverable (see [Undo & recovery](/history/undo-recovery/)).

## Inspecting schema history

Schema changes are recorded as their own scope, so you can see when a table was created, which columns were added or dropped, and when a table was removed.

- `CREATE TABLE` records the full table definition at creation.
- `ALTER TABLE` records the definition change as it was applied.
- `DROP TABLE` records the removal, after which the table's rows are no longer reachable through the catalog.

Schema history is what makes it possible to reconstruct *what the database looked like* at an earlier point — not just what a single row held.

## Where to see history

History is available in two places:

1. **The dashboard History view.** Open a database and use **History** to move through the journal, inspect operations, and drill into a record's revisions. This is the primary human-facing surface.
2. **The raw WAL endpoint.** The dashboard timeline reads from `GET /api/v1/databases/{id}/wal`, which streams the journal filtered to your database. This is a dashboard-session endpoint, not an API-key surface; most teams should use the timeline view rather than the raw endpoint.

## How reconstruction works

History is not a separate "audit table" maintained alongside your data — it is the storage journal itself. To show the state at position *N*, the timeline replays records `0..N`, building the in-memory representation of each table, index, and schema object. That is why inspecting a point deep in history can be more expensive than reading live data: it replays the prefix of the journal up to that point.

## What history does *not* tell you

History is a record of *what changed*, not *who changed it*:

- **No actor attribution.** Journal records do not carry the user or API key that caused a change, so you cannot tell from the WAL alone which member or which key performed an operation. Keep your own audit trail in your application if you need per-actor attribution.
- **No SQL statement text.** The journal records the resulting key/value change, not the original `INSERT`/`UPDATE` statement that produced it. You can see the effect, not the intent.
- **No retention guarantee.** History exists while the required records remain available in the database journal. The beta does not promise indefinite retention, so treat history as an inspection and undo aid rather than an immutable archive.

## Relationship to transactions

History and [transactions](/engine/transactions/) are separate mechanisms. The journal records durable key/value changes as they are written to storage; it does not group records by transaction. You therefore cannot reconstruct a multi-statement transaction's boundary — or which statements were rolled back before commit — from history alone.

## Next

- [Undo & recovery](/history/undo-recovery/) — turn history into a fix.
- [Storage model](/internals/storage/) — the key scheme history is built on.
- [Architecture](/internals/architecture/) — where the journal sits in the engine.
