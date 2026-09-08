---
title: Undo & recovery
description: Undo database mistakes with scoped, reviewable SQL, while understanding the limits of history, backups, and point-in-time recovery.
---

When a bad `UPDATE` wipes a column, an AI agent drops the wrong table, or a delete goes one `WHERE` clause too far, history is only half the answer — you also need to correct the live data. database.pizza provides **scoped undo**: choose a record, table, or available historical state, review the generated SQL, and apply only the correction you intend.

## How undo works

Undo is **client-generated SQL replay**. The dashboard reads the journal (see [Change history](/history/change-history/)) and produces ordinary `INSERT`/`UPDATE`/`DELETE` statements that restore the state you picked. You review those statements and run them against your database.

The flow:

1. **Select a scope.** Pick a single record, a table, or a position in the timeline.
2. **Review the generated SQL.** The dashboard shows exactly which statements it will run — the columns, values, and primary keys involved.
3. **Apply it.** The statements execute against your database through the normal signed-in query surface and become new history.

Because the output is plain SQL, you can copy it, edit it, run it against a different database, or keep it as a record of what you changed.

## Scoped undo

Undo is **scoped**, not all-or-nothing:

- **Record-level undo** restores a single row to a previous value — for example, the value it held before a bad `UPDATE`, or the row itself after a mistaken `DELETE`.
- **Table-level undo** rebuilds a table from its state at an earlier available position.
- **Schema-level recovery** can restore a dropped table's definition and rows, or undo a column change, by replaying the schema and data records that existed at that point.

You decide the blast radius. That is the safety-first property: correcting one row does not require rewinding unrelated live changes.

## What recovery is *not*

It is important to be precise about what this feature is and is not. Undo is a **surgical, reviewed convenience**, not a backup system.

- **Not atomic.** Restored statements run one at a time over the normal query surface. There is no transaction wrapping the whole restore, so a failure partway through can leave a partially restored state. Review the generated SQL, and for anything structural, consider running it in stages.
- **Not backup or point-in-time recovery (PITR).** Undo reconstructs individual values from the write-ahead journal. It is not a full snapshot restore, and it is not a replacement for regular exports. Keep your own backups for disaster recovery — see [Import & export](/guides/import-export/).
- **Not transactional rollback.** Unlike `ROLLBACK`, which reverts a still-open transaction in memory, undo generates new writes to bring data back to an earlier shape. Those writes themselves are new history.
- **Bounded by journal retention.** If the journal has aged out the records you need, the earlier state cannot be reconstructed from history. Recoverable history is a moving window, not an infinite archive.
- **No actor attribution.** Undo restores *values*, not accountability. It does not identify who made the original change.

## Recovery for AI-built apps

AI agents change data fast, and their mistakes are often subtle — an over-broad `UPDATE`, a `DROP TABLE` on the wrong name, a migration that ran twice. database.pizza is built for exactly this failure mode:

- **Inspect before you trust.** When an agent finishes a task, skim the [change history](/history/change-history/) for the tables it touched.
- **Undo narrowly.** Revert only the records the agent got wrong, rather than throwing away the whole session's work.
- **Give agents narrow keys.** An agent that only holds `read` and `write` (not `alter_table` or `drop_table`) can't drop a table it should keep. See [API keys & permissions](/clients/api-keys/).
- **Review generated restore SQL** the same way you review the SQL the agent wrote in the first place.

## Practical guidance

- Fix a single bad write with **record-level undo**, not a full restore.
- If a restore must touch schema or many rows, run it in stages and verify each stage.
- Keep your own export-based backups for anything you cannot afford to lose; history is a safety net, not a guarantee.
- Prefer narrow-scope keys for anything automated, so undo stays within reach of what a tool is allowed to change.

## Next

- [Change history](/history/change-history/) — how the journal records what you're undoing.
- [Quickstart](/getting-started/quickstart/) — get a database to protect.
- [Import & export](/guides/import-export/) — the backup path that complements undo.
- [Transactions](/engine/transactions/) — how in-memory `ROLLBACK` differs from undo.
