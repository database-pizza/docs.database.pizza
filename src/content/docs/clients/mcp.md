---
title: MCP for agents
description: Connect Claude Code, Claude Desktop, Cursor, or another MCP client to a database.pizza database with a database-scoped API key.
---

database.pizza exposes the [Model Context Protocol](https://modelcontextprotocol.io) over Streamable HTTP. An agent can list tables, inspect columns, and run SQL through the same scoped API key your application uses — no driver and no local database process.

## The fast path

1. Go to `https://app.database.pizza/start`.
2. Continue with GitHub or Google (or use an email link).
3. database.pizza creates a workspace, an `app` database, and a database-scoped key, then shows a copyable MCP config.

The full key is shown once. If it is lost, create another key from the database's **API keys** page.

Already have a workspace? The same link takes you to your console home.

## Endpoint and authentication

```text
POST https://db.database.pizza/mcp
Authorization: Bearer pz_live_REPLACE_ME
Content-Type: application/json
```

The key must be a `DB_ACCESS` key bound to one database. The endpoint is stateless: the key selects the organization and database, so there is no path, session, or extra configuration. A key for one database cannot reach another.

## Tools

| Tool | Arguments | What it does |
| --- | --- | --- |
| `run_sql` | `sql`, optional `params` | Runs one SQLite-style statement after checking the key's scopes. |
| `list_tables` | none | Lists user tables. Requires the `read` scope. |
| `describe_table` | `table` | Returns column definitions. Requires the `read` scope. |

`run_sql` accepts exactly one statement per call. Transactions are rejected over MCP; use the PostgreSQL wire protocol when you need them. Results are capped at 200 rows and include `truncated` and `rowCount` when larger.

## Claude Code

```bash
claude mcp add --transport http database-pizza https://db.database.pizza/mcp \
  --header "Authorization: Bearer pz_live_REPLACE_ME"
```

## Claude Desktop, Cursor, and other clients

```json
{
  "mcpServers": {
    "database-pizza": {
      "type": "http",
      "url": "https://db.database.pizza/mcp",
      "headers": {
        "Authorization": "Bearer pz_live_REPLACE_ME"
      }
    }
  }
}
```

## A first prompt

```text
Use the database-pizza MCP tools. Create a notes table with id, title, body,
and created_at, insert a welcome row, then show it to me.
```

## Limits and safety

- The SQL dialect is SQLite-style, not PostgreSQL. See [Compatibility](/sql-reference/compatibility/).
- The key's scopes are enforced on every call. A read-only key cannot write, and `drop_table` must be granted explicitly.
- Queries count toward your organization quota and appear in the database's query log like any other client.
- Never paste a key into a public repository or a shared agent prompt.

Related: [API keys & permissions](/clients/api-keys/), [HTTP query API](/clients/http-api/), [Connect](/getting-started/connect/).
