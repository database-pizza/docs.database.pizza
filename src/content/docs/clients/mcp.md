---
title: MCP for agents
description: Let a coding agent install and configure its own MCP connection to a browser-approved workspace, without pasting API keys into a prompt.
---

database.pizza exposes a **Streamable HTTP** MCP endpoint at:

```text
https://db.database.pizza/mcp
```

The installed helper also runs a local stdio bridge, so clients that do not
support remote HTTP MCP servers can use the same connection.

## How connection works

1. Sign in at [app.database.pizza/start](https://app.database.pizza/start). Your
   default workspace is created automatically. No database or API key is created
   yet.
2. Copy the agent instructions from the workspace (the empty state, or the
   **Build with an agent** disclosure when you already have databases).
3. Paste them into your current project, or use them to start a new one. The
   instructions are collapsed by default; open **View instructions** to read them.
4. Your agent downloads the setup helper, inspects it, and runs it. The helper
   opens a browser approval page.
5. Choose a workspace and approve the connection. You can optionally grant
   destructive operations.
6. The helper saves the credential outside your repository with `0600`
   permissions, configures your MCP client, and exits. The credential is never
   printed, and it is not placed in project configuration.

The approval page shows a short code. Compare it with the code your agent
printed before approving. Only approve a connection you just started.

The resulting agent connection is **workspace-scoped**, expires after **7 days**,
and can be revoked in **Workspace settings → Agent connections**. It is not an
account-wide key: it cannot reach other workspaces, members, billing, or account
security.

## Supported clients

The helper recognizes `--client claude`, `--client codex`, `--client cursor`,
and `--client vscode`. For another client, use `--client other`; it prints a
secret-free stdio configuration you can adapt.

Client behavior differs:

- **Claude Code** stores the stdio bridge in its local MCP configuration.
- **Codex** updates only its `database-pizza` server table in the project's
  `.codex/config.toml`. The project must be trusted by Codex for project MCP
  configuration to load.
- **Cursor** adds `database-pizza` under `mcpServers` in
  `.cursor/mcp.json` while preserving other servers.
- **VS Code** adds it under `servers` in `.vscode/mcp.json`, preserving other
  servers.

Some clients load MCP tools only when a session starts. After approval, the
helper can complete setup and the first write/read through `--call` in the
current session. Reopen the session when you want the native MCP tools listed.
This guide and the helper's client formats are tested locally; a full hosted
model session for every client is not yet independently verified.

## What the agent can do

The agent has two kinds of access.

**Database SQL** works like a database-scoped key, but you choose the database
per call with `database_id`:

- `run_sql` — one SQLite-style statement. Transactions are rejected.
- `list_tables` and `describe_table` — discover schema.

**Workspace operations** are organization-bounded and individually checked
against the approved scopes:

| Tool | Purpose |
| --- | --- |
| `list_databases` | List databases in the approved workspace only |
| `get_workspace` | Read quota and usage |
| `get_database` | Database details and engine capabilities |
| `create_database` | Create within the workspace quota |
| `pause_database` / `resume_database` | Change availability for new access |
| `delete_database` | Hide/delete database access; requires an exact name confirmation |
| `create_backup` | Save a checksummed logical SQL export |
| `list_backups` | List saved logical backups |
| `export_backup` | Get an authenticated, checksummed download path |
| `restore_backup` | Replay a backup into a **new** database |
| `delete_backup` | Permanently delete a saved backup |
| `get_application_key_setup` | Get helper arguments for a separate app key |
| `get_history` | Inspect retained row, schema, index-definition, and maintenance history |

Default approval includes read/write/schema changes, database creation,
pause/resume, backups, restore, history, and app-key creation. **Row deletion
and column/index changes are included in the default Work with data and schema
approval.** Deleting databases or backups and `DROP TABLE` require the separate
**destructive operations** checkbox.

Existing database-scoped `DB_ACCESS` keys do not gain any of these workspace
tools. Only browser-approved agent connections do.

## Database deletion and pause

`pause_database` and `delete_database` change availability for **new** access:

- An already authenticated PostgreSQL tunnel is not terminated.
- `delete_database` keeps a name tombstone so a later database with the same
  slug cannot resolve to retained old data. This is a data-safety boundary, not
  secure storage erasure.
- `delete_backup` removes the saved file; it does not touch the source database.

## Backups are logical exports

`create_backup` is a real, checksummed SQL export stored server-side. It is
**not** a physical snapshot, point-in-time backup, or retained-history archive.

- **Stop application writes and schema changes before creating one.** Export is
  not transactionally consistent.
- The limit is **16 MiB** per logical export and **10 saved backups per database**
  (**128 MiB per workspace**).
- Unsupported schema features fail closed rather than producing a silently
  incomplete backup.
- Ordinary indexes, unique indexes, defaults, and `AUTOINCREMENT` are included
  when the catalog can represent them safely. An index-level `ON CONFLICT`
  policy is not reconstructed; reapply it explicitly after a restore.
- `restore_backup` replays into a **new** database. The source is never
  overwritten. A failed replay returns a `partial` result; never treat that as a
  successful restore.

`export_backup` returns a download path. The private local helper downloads it
with `--download <backup-id> --out <private-file.sql>` and verifies the SHA-256
before writing the file.

## Application access is separate

The workspace agent token is for agent operations, not app code. Ask the agent
to use `get_application_key_setup`, or run the installed helper:

```bash
node ~/.config/database-pizza/agent-setup.mjs \
  --app-key <database-id> --out .env.local
```

Add `--read-only` when the app does not write. The helper creates a separate
**database-scoped** `DB_ACCESS` key, writes it to an ignored private file, and
never prints it. It preserves unrelated environment entries and refuses tracked
output paths. Never load that file into model context or ship it to a browser.

## Inspecting history

`get_history` returns retained operations for one approved database. Filters by
table, paginates over that database/table history with `after`/`next_after`, and
caps source files at **256 MiB** and each call at **100 records**. Values that
are not valid UTF-8 are base64-encoded.

Use the history to find an earlier row, schema, or index definition. Restore by
running reviewed SQL. Raw index-maintenance keys in history are diagnostic, not
a restore API. History is bounded by journal retention and is not an indefinite
archive.

## Limits

- **One statement per call.** No transactions over MCP.
- **200 rows** per SQL result.
- SQL payloads are capped at **64 KiB**; MCP bodies at **1 MiB**.
- Agent tokens expire after **7 days**.
- Workspace backup/restore/history operations have a small concurrency limit and
  return a retryable error when busy.

## Troubleshooting

- **Browser did not open:** use the printed approval URL.
- **Code expired or was used:** run setup again from your agent.
- **`access_denied`:** the approval was denied, or your workspace permission was
  removed. Ask a workspace admin.
- **Agent tools do not appear:** reopen the client session, or use the installed
  helper with `--call`.
- **Backup rejected:** stop writes, confirm the database is active and within
  quota, and check whether the schema contains an unsupported definition.
- **Connection revoked/expired:** re-run the helper and approve a new connection.
  Credentials are never recoverable from the previous file.

## Related

- [API keys & permissions](/clients/api-keys/) — scopes and revocation.
- [Undo & recovery](/history/undo-recovery/) — what history can and cannot restore.
- [Import & export](/guides/import-export/) — moving data in and out.
- [Using these docs with AI](/ai/) — raw Markdown and `llms.txt`.
