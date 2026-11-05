---
title: MCP for agents
description: Give a coding agent a short-lived MCP key, then connect it to a workspace database over Streamable HTTP.
---

database.pizza exposes a **Streamable HTTP** MCP endpoint:

```text
https://db.database.pizza/mcp
```

Authentication is a Bearer token. There is no local helper, browser approval
step, or long-lived credential in the prompt.

## Create a key

Open a workspace and choose **MCP** in the sidebar.

- **Copy agent instructions** creates a new **6-hour setup key** and copies a
  short prompt containing the MCP URL, the Bearer header, and the first steps.
- **Create a custom MCP key** creates a build or read-only key with a lifetime
  from 1 hour to 7 days. Build keys can optionally allow destructive operations.

The full key is shown once. The setup key is deliberately visible in the
copied prompt, so treat that prompt as a secret:

- Do not commit it, paste it into a public issue, or send it to analytics.
- It expires after 6 hours. Revoke it sooner from **MCP** if it may have leaked.
- App code must use a separate database key from **API keys**, not the MCP key.

## Connect a client

Add a Streamable HTTP MCP server using your client's configuration format:

```text
URL:    https://db.database.pizza/mcp
Header: Authorization: Bearer <key>
```

A client that uses the common `mcpServers` shape might look like:

```json
{
  "mcpServers": {
    "database-pizza": {
      "type": "http",
      "url": "https://db.database.pizza/mcp",
      "headers": { "Authorization": "Bearer pz_live_REPLACE_ME" }
    }
  }
}
```

Client formats differ. The copied setup prompt tells the agent to configure its
own client; if the client only loads MCP on restart, the agent should say so
instead of assuming it worked.

## Key presets

| Preset | Lifetime | Scopes |
| --- | --- | --- |
| Setup (copy button) | Fixed 6 hours | read, write, alter table, create databases, view quota |
| Build | 1 hour–7 days | Setup plus pause, logical backup/restore |
| Read only | 1 hour–7 days | read |
| Build + destructive | 1 hour–7 days | Build plus delete databases, backups, and tables |

Setup keys cannot be made destructive. Custom key creation and revocation
require workspace admin permission. Existing database-scoped `DB_ACCESS` keys
do not get workspace tools.

## Tools

SQL tools take a `database_id` from `list_databases`:

- `run_sql` — one SQLite-style statement per call; transactions are rejected.
- `list_tables`, `describe_table`.

Workspace tools are filtered by the key's scopes:

| Tool | Purpose |
| --- | --- |
| `list_databases` | List PizzaSQL databases in this workspace |
| `get_workspace` | Read quota and usage |
| `get_database` | Database details and engine capabilities |
| `create_database` | Create within quota |
| `pause_database` / `resume_database` | Change availability for new access |
| `delete_database` | Tombstone database access; requires confirmation |
| `create_backup` | Save a checksummed logical SQL export |
| `list_backups` / `export_backup` | List or get an authenticated download path |
| `restore_backup` | Replay into a **new** database |
| `delete_backup` | Permanently delete a saved backup |
| `get_history` | Inspect retained row/schema/index history |

Deletion and `DROP TABLE` require the destructive preset. Database deletion does
not securely erase retained storage and does not close active PostgreSQL
tunnels.

## Backups and history

Backups are **logical SQL exports**, not physical snapshots or point-in-time
recovery:

- 16 MiB per export, 10 per source database, 128 MiB per workspace.
- Stop writes and schema changes before creating one; capture is not
  transactionally consistent.
- Unsupported generated columns/expression indexes fail closed.
- Index-level `ON CONFLICT` policy is not reconstructed.
- Restore creates a new database; it never overwrites the source. A failed
  replay returns `partial`.

`get_history` paginates retained journal operations, capped at 100 records per
call and a 256 MiB source. Use reviewed SQL to restore a row, table, or schema
definition; raw index-maintenance keys are not a restore API.

## Errors

Failed `run_sql` calls return the engine's SQLSTATE in the tool error, both as a `code` field and in the message text, for example `42P01` for a missing table, `42601` for a syntax error, `23505`/`23503`/`23514`/`23502` for constraint violations, `42703` for an unknown column, `0A000` for unsupported features, and `22P02` for invalid input text. The HTTP query API reports the same code.

## Limits

- One statement per MCP call; no transactions; 200 rows per SQL result.
- MCP body 1 MiB; SQL 64 KiB.
- Backup/restore/history work is bounded to two concurrent operations per
  process and a five-minute transfer deadline.

## Troubleshooting

- **401/403:** the key is expired, revoked, or lacks the required scope.
- **Database unavailable:** it is outside the key's workspace, not PizzaSQL, or
  paused.
- **Tools missing after configuration:** reopen the client session.
- **Backup rejected:** stop writes, check quota/size, and check the schema for
  unsupported definitions.
- **Restore is partial:** inspect the new database, do not treat it as complete,
  and do not delete the source.

## Related

- [API keys & permissions](/clients/api-keys/) — application keys and scopes.
- [Undo & recovery](/history/undo-recovery/) — what history can restore.
- [Import & export](/guides/import-export/) — moving data in and out.
- [Using these docs with AI](/ai/) — raw Markdown and `llms.txt`.
