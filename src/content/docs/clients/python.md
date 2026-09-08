---
title: Python
description: Query database.pizza from Python using psycopg or the HTTP query API.
---

Python offers the same two surfaces as every other language: the **PostgreSQL wire protocol** through a driver like `psycopg`, or the **HTTP query API** through `requests` or `httpx`. Use the wire protocol when you need transactions or a connection pool; use HTTP for serverless and scripts.

```bash
export PZ_API_KEY='pz_live_REPLACE_ME'
```

## With `psycopg`

```bash
pip install "psycopg[binary]"
```

```python
import os
import psycopg

with psycopg.connect(
    host="db.database.pizza",
    port=5432,
    user="u",                        # ignored; any value
    password=os.environ["PZ_API_KEY"],
    dbname="acme/production",        # slash is part of the name
    sslmode="disable",               # TLS is declined by the proxy
) as conn:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id    INTEGER PRIMARY KEY,
                name  TEXT NOT NULL,
                email TEXT UNIQUE
            )
            """
        )

        cur.execute(
            "INSERT INTO users (name, email) VALUES (%s, %s)",
            ("Ada Lovelace", "ada@acme.example"),
        )

        cur.execute("SELECT * FROM users WHERE name = %s", ("Ada Lovelace",))
        print(cur.fetchall())
        # [(1, 'Ada Lovelace', 'ada@acme.example')]
```

Use `%s` placeholders with `psycopg`; the driver substitutes them safely.

### With SQLAlchemy

SQLAlchemy can be pointed at the `postgresql+psycopg` dialect using the URI from [Connect](/getting-started/connect/), but it is **not currently verified** end to end. If you try it:

```python
from sqlalchemy import create_engine

engine = create_engine(
    "postgresql+psycopg://u:pz_live_REPLACE_ME@db.database.pizza:5432/acme%2Fproduction?sslmode=disable"
)
```

Keep your models to the SQLite-compatible subset (`Integer` primary keys with autoincrement, `String`/`Text`, no `ARRAY`/`JSONB`), and test your exact ORM and migration path before deploying. See [Compatibility](/sql-reference/compatibility/).

## With `requests` (HTTP)

```python
import os
import requests

KEY = os.environ["PZ_API_KEY"]
BASE = "https://db.database.pizza/acme/production"

def query(sql, params=None):
    res = requests.post(
        f"{BASE}/query",
        headers={"Authorization": f"Bearer {KEY}"},
        json={"sql": sql, "params": params or []},
    )
    if not res.ok:
        raise RuntimeError(f"query failed ({res.status_code}): {res.json().get('error')}")
    return res.json()

result = query("SELECT * FROM invoices WHERE status = ?", ["open"])
print(result["columns"])  # [{ "name": "id", "type": "INTEGER" }, …]
print(result["rows"])     # [[1, 1, 4500, "open", "…"], …]
```

Use `?` placeholders with the HTTP `params` array. `$1` placeholders are supported on the PostgreSQL wire path, not over HTTP. The HTTP API does not support transactions; use `psycopg` when you need them.

## With `httpx` (async)

```python
import os
import httpx

async def main():
    async with httpx.AsyncClient(base_url="https://db.database.pizza") as client:
        res = await client.post(
            "/acme/production/query",
            headers={"Authorization": f"Bearer {os.environ['PZ_API_KEY']}"},
            json={"sql": "SELECT 1 + 1 AS answer"},
        )
        print(res.json())
```

## Choosing between them

| | `psycopg` | `requests` |
| --- | --- | --- |
| Transactions | Yes | No |
| Connection reuse | Yes | Stateless |
| Serverless / scripts | Needs a socket | Anywhere |
| Placeholder style | `%s` | `?` or `$1` |

Both enforce the same API key scopes.

## Next

- [JavaScript](/clients/javascript/) — the same surfaces in JS.
- [HTTP query API](/clients/http-api/) — full endpoint reference.
- [PostgreSQL clients](/clients/postgresql/) — more drivers and GUIs.
