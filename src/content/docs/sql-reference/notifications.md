---
title: LISTEN, NOTIFY, and subscriptions
description: PostgreSQL-compatible channels in PizzaSQL, their transaction semantics, limits, and the managed SSE fan-out endpoint.
---

PizzaSQL implements PostgreSQL-style `LISTEN`, `UNLISTEN`, and `NOTIFY` over the
PostgreSQL wire protocol. Notifications are delivered asynchronously as
`NotificationResponse` frames, so an idle client sees them without polling.

## SQL syntax

```sql
LISTEN channel;
UNLISTEN channel;
UNLISTEN *;
NOTIFY channel;
NOTIFY channel, 'payload';
```

- `channel` is an identifier (quote it for mixed case or punctuation). Channel
  names are limited to 63 bytes.
- `payload` is an optional string literal of at most 8000 bytes.
- A transaction may raise many notifications, but duplicate `(channel, payload)`
  pairs collapse to one delivery.
- Command tags are `LISTEN`, `UNLISTEN`, and `NOTIFY`.

`LISTEN` and `UNLISTEN` take effect when the transaction commits. `NOTIFY` is
delivered only after a successful commit; `ROLLBACK` discards pending
notifications, and `ROLLBACK TO SAVEPOINT` discards notifications raised after
that savepoint.

```sql
BEGIN;
INSERT INTO jobs (id, state) VALUES (1, 'queued');
NOTIFY jobs, '1 queued';
COMMIT; -- the notification becomes visible here
```

A `NOTIFY` outside an explicit transaction is delivered immediately after the
statement. Notifications raised by the same connection are delivered back to it
when it also listens on the channel.

## Commit cursor

After a committed write transaction, PizzaSQL sends a `ParameterStatus` frame
named `pizzasql.lsn` whose value is the commit LSN. Notifications carry a
monotonically increasing LSN per database; the SSE endpoint exposes it as the
event `id`. The LSN is an ordering and resume cursor, not a durable replay log.

The HTTP query API returns the same value as `lsn` on a `COMMIT` response.

## Managed service: channel scopes

The managed PostgreSQL proxy classifies `LISTEN`, `UNLISTEN`, and `NOTIFY` and
requires a matching channel scope on the API key. The data scopes (`read`,
`write`, `alter_table`, `drop_table`) do not grant channel access.

| Scope | Grants |
| --- | --- |
| `listen:<pattern>` | `LISTEN`/`UNLISTEN` on matching channels |
| `notify:<pattern>` | `NOTIFY` on matching channels |

Patterns are an exact channel name or a prefix ending in `*`:

```text
listen:orders
listen:orders.*
notify:*
```

`UNLISTEN *` is allowed when the key has any `listen:` scope. Long-lived
listener connections hold one connection against the organization's quota until
they disconnect; the proxy has no idle timeout that drops them.

## SSE fan-out

Browser and mobile clients should not each hold a database connection. The
managed service exposes an SSE endpoint that shares a bounded listener pool per
tenant and channel:

```http
GET /{org}/{db}/subscribe?channel=orders.created&channel=audit
Authorization: Bearer pz_live_...
Accept: text/event-stream
```

- Authenticate with a `DB_ACCESS` API key. Each requested channel must match a
  `listen:` scope on that key.
- Repeat the `channel` parameter or use a comma-separated list. At most 16
  channels may be requested per connection.
- The server holds at most `SUBSCRIPTION_MAX_LISTENERS_PER_ORG` database
  listeners per organization (default 16), shared by all clients. A client
  subscribing to four channels consumes four listener slots, not four database
  connections per browser tab.
- Events use the notification LSN as their SSE `id`:

```text
id: 42
event: notification
data: {"pid":123,"channel":"orders.created","payload":"17","lsn":42}
```

- A client that cannot keep up is disconnected with an `error` event rather than
  blocking publishers. Reconnect with `EventSource` or a streaming `fetch`.
- Keepalive comments are sent every 15 seconds.

The SSE endpoint currently authenticates only with an API key (`Authorization:
Bearer`), not a console session cookie. `EventSource` cannot set headers; use a
streaming `fetch` implementation from browser code.

## Limitations in v1

- Notifications are **not durable**. There is no replay or catch-up after a
  disconnect, and a server restart loses undelivered events.
- Fan-out is in-process. One PizzaSQL process serves a database today; a future
  multi-process deployment would need a shared notification bus.
- Triggers are not implemented, so `NOTIFY` must be issued by an application
  statement.
- Channel names containing `"` are rejected by the SSE listener because the
  SQLite-style identifier lexer does not support escaped quotes.
