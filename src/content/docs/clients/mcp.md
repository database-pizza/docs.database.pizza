---
title: MCP for agents
description: Connect Claude Code, Codex, Cursor, VS Code, or another Streamable HTTP MCP client with a key restricted to one organization and database.
---

database.pizza exposes three SQL tools over [Model Context Protocol](https://modelcontextprotocol.io) Streamable HTTP: `run_sql`, `list_tables`, and `describe_table`. Your coding agent can inspect a schema and run SQLite-style SQL without a database driver.

## Open the agent handoff

Go to [app.database.pizza/start](https://app.database.pizza/start).

- **New account:** sign in; the service creates a workspace, an `app` database, and a database-scoped key. Save the key while it is visible.
- **Existing account:** choose an organization and database, then open **Connect agent**. Nothing is created until you explicitly create a key.
- **From a database:** select the **Connect agent** tab. The same controls are available through **API keys → Connect agent**.
- **Just inspecting the UI:** open [the handoff preview](https://app.database.pizza/start?preview=1). It uses placeholders and does not create resources or grant access.

The handoff has client-specific setup, a credential-free first prompt, and key creation/revocation. Existing keys are not recoverable: use a locally saved key, or create a replacement and revoke the old one after updating your client.

## Access boundary: organization-owned, database-scoped

MCP does **not** use an account-wide credential or the browser login session. It requires an ordinary `DB_ACCESS` API key bound to **one database within one organization**. The key selects the database; tool arguments cannot switch to another organization or database. Platform and REST keys are rejected.

Creating or revoking a key requires organization developer access or higher. The console offers:

- **Read only:** `read`; discover tables, inspect columns, and query data.
- **Build:** `read`, `write`, `alter_table`; also create tables, change schema/indexes, and insert/update/delete rows.

New quickstart keys use Build permissions. Neither profile grants `drop_table`. Build is still powerful: `write` includes row deletion, and `alter_table` can change columns and indexes. Use **API keys** for deliberate custom scopes. Revoking a key denies subsequent MCP requests; it does not undo completed writes or cancel a request already in progress.

## Endpoint

```text
POST https://db.database.pizza/mcp
Authorization: Bearer pz_live_REPLACE_ME
Content-Type: application/json
Accept: application/json, text/event-stream
```

The endpoint is stateless. Use Streamable HTTP, not the older SSE transport. There is no separate MCP account or additional token exchange.

## Claude Code

Set `PZ_API_KEY` privately in your local shell. For example, in Bash, this avoids putting the value into shell history or printing it:

```bash
read -rsp 'database.pizza key: ' PZ_API_KEY; export PZ_API_KEY; printf '\n'
```

Then run the following **locally**, not in an agent chat containing the expanded key:

```bash
claude mcp add --transport http --scope local database-pizza https://db.database.pizza/mcp \
  --header "Authorization: Bearer $PZ_API_KEY"
```

The shell expands the variable and Claude Code saves a local-scope configuration. Keep that configuration private. Reopen the agent session if needed, check the MCP server is enabled, and approve its tools.

## Codex

Set `PZ_API_KEY` privately in the environment you use to launch Codex, then run locally:

```bash
codex mcp add database-pizza --url https://db.database.pizza/mcp \
  --bearer-token-env-var PZ_API_KEY
```

This saves a reference to the environment variable, not its value. Make the variable available to subsequent Codex sessions. Reopen the session if needed and approve the tools. The command options were checked against the installed CLI's `mcp add --help`; that is not an end-to-end hosted-model verification.

## Cursor

Open **Settings → Tools & MCP** and add a remote server to your private MCP configuration. Cursor uses `mcpServers`:

```json
{
  "mcpServers": {
    "database-pizza": {
      "url": "https://db.database.pizza/mcp",
      "headers": {
        "Authorization": "Bearer pz_live_REPLACE_ME"
      }
    }
  }
}
```

Replace the placeholder locally. This config contains a credential: prefer a user-level configuration; never commit a project-level `.cursor/mcp.json` containing a real key. Enable the server and approve its tools.

## VS Code

VS Code uses `servers`, not Cursor's `mcpServers`. Open the user MCP configuration and add:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "pizza-key",
      "description": "database.pizza API key",
      "password": true
    }
  ],
  "servers": {
    "database-pizza": {
      "type": "http",
      "url": "https://db.database.pizza/mcp",
      "headers": {
        "Authorization": "Bearer ${input:pizza-key}"
      }
    }
  }
}
```

Start the server and enter the key in the private input. The configuration itself contains no key. Client availability and exact menus depend on the installed version. Other clients must support Streamable HTTP and custom authorization headers; do not assume that this JSON works unchanged in every MCP client.

## First prompt

After connecting, paste this **without credentials** into your agent:

```text
Use the database-pizza MCP tools. Inspect existing tables first. In an empty
database, create notes with id INTEGER PRIMARY KEY, title TEXT, and body TEXT.
Insert a welcome note using bound parameters, then read it back. Ask before
changing an existing schema. Use SQLite-style SQL, one statement per call,
and no transactions. Never print credentials or put them in source code.
```

A read-only key can inspect data but cannot create the example. Inspect the result in the console's **Data** and **History** views.

## Tools and limits

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `run_sql` | `sql`, optional `params` array | One SQLite-style SQL statement; key scopes are enforced. |
| `list_tables` | none | Lists user tables; requires `read`. |
| `describe_table` | `table` | Returns column definitions; requires `read`. |

- Transactions are rejected over MCP. Use a tested PostgreSQL client over a protected connection if you need transactions.
- Results are capped at 200 rows; larger results include `truncated` and `rowCount`.
- Requests count toward your organization's quota and enter the database metrics path.
- A successful `run_sql` emits bounded activation analytics, not an event per statement. SQL, results, and credentials are not activation properties; activation deduplication is per API process.
- Database.pizza history is not an immutable audit log and has no per-actor attribution.

## Troubleshooting

- **401 / invalid key:** check the local configuration or create a replacement key. A revoked key cannot be recovered.
- **403 / permission denied:** select a key for the correct database with the needed scopes. Account login, REST keys, and platform keys are not MCP credentials.
- **405 on GET:** expected; this server uses POST request/response and does not open a long-lived SSE stream.
- **No tools after setup:** enable the server, reopen the agent session, and check whether your client supports remote Streamable HTTP with bearer headers.
- **Unsupported SQL / transaction:** read [Compatibility](/sql-reference/compatibility/). SQL is SQLite-inspired, not PostgreSQL; MCP executes one statement at a time.

For application code or clients without compatible MCP support, use the [HTTPS query API](/clients/http-api/) with local environment credentials. Never expose a database key in browser code or paste it into a shared prompt.
