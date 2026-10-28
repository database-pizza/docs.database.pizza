---
title: Engine updates
description: How engine releases reach a tenant, and how to restart now or schedule the cutover.
---

PizzaSQL and PizzaKV are upgraded together as one compatible **engine pair**. Platform releases (the console, API, and proxy) do **not** change a tenant's engine pair and do not restart tenant databases. An engine update only happens when an organization owner applies an available pair.

## Finding an update

When the release control plane offers a newer compatible pair, the organization home page shows an **Engine update available** banner with:

- the running and available pair,
- the release changelog and severity,
- compatibility notes, including whether a storage migration is required and whether rollback is supported.

Open **Review changelog & update** to read the full notes before doing anything.

## Choosing when to restart

Only an organization owner can apply the update. The dialog offers:

- **Restart now** — confirm that the tenant databases will restart briefly. The control plane snapshots, stops, starts the new pair, and health-gates it before reporting success. In-flight transactions may be interrupted.
- **Schedule** — pick a one-off local date and time at least a minute ahead. The operation stays queued and the release scheduler performs the same snapshot/cutover/health sequence when the time arrives.

The operation is durable and auditable. If a start or health check fails, the previous pair is restored where rollback is supported; storage-migration updates may be one-way, which the dialog warns about.

## API

The same choices are available over the API:

```http
POST /api/v1/orgs/{org_id}/engine/upgrade
Authorization: session cookie
Content-Type: application/json

{"release_id": "<release>", "approve_now": true}
```

```json
{"release_id": "<release>", "scheduled_for": "2026-11-02T02:30:00Z"}
```

Omit both fields to create a pending request that an owner approves later in settings. The response is the engine state plus `operation_id` and, for scheduled requests, `scheduled_for`. Poll `GET /api/v1/orgs/{org_id}/engine` to follow the operation.

## Automatic policies

Organizations can opt into automatic policies in settings (channel plus a daily or weekly maintenance window). Automatic cutovers use the same gates and never cross an incompatible storage format. Leave the policy manual to rely solely on the home-page banner.
