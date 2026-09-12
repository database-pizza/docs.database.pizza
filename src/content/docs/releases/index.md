---
title: Release policy
description: How database.pizza versions PizzaKV, PizzaSQL, and the managed app, and how paired engine compatibility is defined.
---

database.pizza ships three independently versioned components that are released
together as one or more validated **pairs**:

| Component | Repository | Versioned artifact |
| --- | --- | --- |
| PizzaKV | `pizzakv` | `pizzakv` engine binary |
| PizzaSQL | `pizzasql` | `pizzasql` engine binary |
| database.pizza app | `app.database.pizza` | `dbpizza` orchestrator and API |

Every component follows [Semantic Versioning 2.0.0](https://semver.org/). A
release tag in a component repository is `vMAJOR.MINOR.PATCH` (for example
`v0.1.0`). Pre-release builds append a hyphenated identifier
(`v0.2.0-rc.1`); build metadata is never used for ordering.

## What each number means

- **MAJOR** changes when the component removes or changes behavior that callers
  or stored data depend on. For PizzaKV this includes the on-disk `PKVDB`
  storage format; for PizzaSQL it includes SQL semantics and the
  PostgreSQL-compatible wire behavior.
- **MINOR** adds backward-compatible functionality. A minor PizzaSQL release may
  require a newer PizzaKV within the same supported pair window.
- **PATCH** is a backward-compatible fix with no change to storage or wire
  formats.

The storage format is tracked separately from the version string as an integer.
A storage format never decreases, and a format increase is a migration, not a
refactor. Release notes state the format explicitly.

## Paired engine compatibility

PizzaSQL and PizzaKV are **not** independently selectable. A managed database
always runs a complete, validated `PizzaKV + PizzaSQL` pair. The control plane
(`app.database.pizza`) stores each pair as an immutable release with:

- both component versions and source commits,
- the artifact filename and `sha256` checksum for each component,
- `storage_format` and `protocol_version`,
- `min_upgradable_from`, the oldest storage format that may upgrade directly.

An upgrade moves a tenant from one complete pair to another. It never mixes
components across pairs. When a new pair raises `storage_format`, only tenants at
or above `min_upgradable_from` are eligible; older tenants must first move
through an intermediate pair.

### Supported pair window

A pair is supported when its PizzaSQL and PizzaKV versions are the ones recorded
in the same manifest entry. The supported upgrade path is:

1. the current stable pair,
2. the previous stable pair, and
3. one active `beta` or `canary` pair for pre-release validation.

Pairs outside that window are not supported upgrade sources, even if their
component versions look compatible.

## Release channels

Each pair is published on exactly one channel:

- `canary` — pre-merge or early validation builds. Not for production tenants.
- `beta` — feature-complete candidates with a migration plan.
- `stable` — promoted, reviewed pairs that tenants may adopt or upgrade to.

A pair also has a promotion state (`draft`, `candidate`, `stable`, `deprecated`,
`revoked`). Draft, deprecated, and revoked pairs are never valid upgrade targets.

## The paired manifest

Every pair is described by one machine-readable manifest that mirrors the
control plane's `EngineRelease` contract. The JSON Schema lives at
`app.database.pizza/backend/internal/releases/release-manifest.schema.json`, and
the template below is validated against the same rules by
`make test` in that repository.

```json
{
  "id": "stable-0.1.0",
  "version": "0.1.0",
  "channel": "stable",
  "promotion_state": "candidate",
  "pizzakv_version": "0.1.0",
  "pizzasql_version": "0.1.0",
  "pizzakv_commit": "0000000000000000000000000000000000000000",
  "pizzasql_commit": "0000000000000000000000000000000000000000",
  "pizzakv_artifact": "pizzakv-0.1.0-freebsd-arm64",
  "pizzasql_artifact": "pizzasql-0.1.0-freebsd-arm64",
  "pizzakv_checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "pizzasql_checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "storage_format": 1,
  "protocol_version": 1,
  "min_upgradable_from": 0,
  "release_notes": "Initial paired PizzaKV + PizzaSQL release."
}
```

- `version` is the pair's SemVer identity; both components may use their own
  component versions in `pizzakv_version` and `pizzasql_version`.
- `checksum` values are `sha256:` followed by 64 lowercase hex characters and
  cover the exact uploaded artifact.
- `min_upgradable_from` is `0` when any older storage format may upgrade
  directly.

## Artifacts

Release artifacts are named for their target platform, for example
`pizzakv-0.1.0-freebsd-arm64` and `pizzasql-0.1.0-freebsd-arm64`. Every build
publishes a `SHA256SUMS` file next to the binaries. FreeBSD ARM64 is the primary
production target; Linux and FreeBSD AMD64 builds are used for verification and
local development.

The CI workflows in each repository build and test their artifacts and validate
the manifest contract, but they do not deploy or publish. Promotion to a
channel is a separate, reviewed operator action.
