---
title: Release notes
description: The canonical structure for database.pizza release notes, with a copy-ready template.
---

Release notes are the human-readable companion to a release manifest. Every
promoted pair and every app release has one note. This page defines the
structure so notes stay comparable across releases and channels.

## Where notes live

- The short operator summary is stored on the release pair itself in the
  manifest's `release_notes` field. It must fit in one or two sentences.
- The full note is a Markdown page under `docs.database.pizza` and is the
  canonical, linkable record. Long-form detail, migration guidance, and known
  issues belong here, not in the manifest.

A note names the exact components and commits it describes. If the note covers a
paired engine release, link the pair version from the release policy page.

## Required sections

Use these sections in this order. Omit a section only when it has nothing to
say, except **Summary**, **Components**, and **Compatibility**, which are always
present.

| Section | Contents |
| --- | --- |
| Summary | One paragraph: what changed and who should care. |
| Components | Table of each component, its version, and its source commit. |
| Compatibility | `storage_format`, `protocol_version`, and `min_upgradable_from`, plus required intermediate pairs. |
| Added | New behavior and features. |
| Changed | Behavior changes that are backward compatible. |
| Fixed | Bug fixes. |
| Security | Security-relevant fixes and their impact. |
| Deprecated | Features or formats scheduled for removal and the replacement. |
| Upgrade notes | Ordered operator steps, snapshots, and rollback expectations. |
| Verification | Artifact names and `sha256` checksums, or a link to `SHA256SUMS`. |
| Known issues | Open problems and workarounds. |

Change entries use the conventional-commit vocabulary where it helps: `feat`,
`fix`, `perf`, `refactor`, and so on. Write for an operator deciding whether to
upgrade, not for a commit log.

## Template

Copy this block for a new note and replace the placeholders.

```markdown
# <pair version / app version> — <YYYY-MM-DD>

## Summary

<What changed, and who should act on it.>

## Components

| Component | Version | Commit |
| --- | --- | --- |
| PizzaKV | <version> | `<commit>` |
| PizzaSQL | <version> | `<commit>` |
| database.pizza app | <version or n/a> | `<commit or n/a>` |

## Compatibility

- Storage format: `<n>` (previous: `<n>`)
- Protocol version: `<n>`
- Minimum upgradable from: `<storage format>` (or any)
- Required intermediate pairs: <none, or list them>

## Added

- <entry>

## Changed

- <entry>

## Fixed

- <entry>

## Security

- <entry>

## Deprecated

- <entry>

## Upgrade notes

1. <operator step, including snapshot requirements>

## Verification

| Artifact | SHA-256 |
| --- | --- |
| `pizzakv-<version>-freebsd-arm64` | `<sha256>` |
| `pizzasql-<version>-freebsd-arm64` | `<sha256>` |

## Known issues

- <entry>
```

## Initial release

### 0.1.0 — initial paired release

**Summary.** First tracked SemVer identity for PizzaKV, PizzaSQL, and the
managed app. No production tenants are upgraded by this note; it establishes the
versioning and manifest convention.

**Components.**

| Component | Version | Commit |
| --- | --- | --- |
| PizzaKV | 0.1.0 | tracked in the release manifest |
| PizzaSQL | 0.1.0 | tracked in the release manifest |
| database.pizza app | 0.1.0 | reported by `app-api -version` |

**Compatibility.** Storage format `1`, protocol version `1`,
`min_upgradable_from` `0`. No intermediate pairs are required.

**Verification.** Artifacts and checksums are recorded in the release manifest
described in the [release policy](/releases/).
