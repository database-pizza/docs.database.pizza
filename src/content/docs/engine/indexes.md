---
title: Indexes
description: Durable index definitions, rebuildable ownership and lookup caches, and conservative equality/LIMIT planning.
---

PizzaSQL persists **index definitions**, not index entries. Lookup and UNIQUE
ownership maps are shared, derived state in the running database manager.
The behavior below describes current source builds; tenant engine upgrades are
separate from app deployments.

## Creating and dropping indexes

```sql
CREATE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx ON t(col);
DROP INDEX idx_users_email;
DROP INDEX IF EXISTS idx_users_email;
```

- Creation verifies the table/columns and persists the definition. Existing
  duplicate non-NULL values reject a UNIQUE index.
- Definitions survive restart and appear in catalog introspection.
- Lookup entries are built from durable rows at creation or lazily when needed.
- `DROP TABLE` drops its index definitions. A disabled or concurrently invalidated
  lookup cache is not treated as an empty index: execution retries or falls back.
- Multi-column keys and `DESC` flags persist, but this is not a PostgreSQL-style
  cost-based planner or an ordered-index scan facility.

## When an index is used

The general SELECT fast path recognizes a primary-key or single-column indexed
`column = literal` equality (including `literal = column`). It also tries eligible
equality conjuncts inside `AND`:

```sql
SELECT id FROM users WHERE email = 'a@b.c';
SELECT id FROM users WHERE email = 'a@b.c' AND active = true;
SELECT id FROM users WHERE id = 42 AND active = true;
```

Bound parameters become literals before this planning step. A qualifier must bind
the correct input table or alias; unsafe JOIN pushdown, including nullable-side
RIGHT/FULL cases, is declined. This is not a general JOIN optimizer.

An index supplies **candidates**. The original WHERE predicate is still evaluated,
including SQL NULL semantics. Numeric candidate keys preserve the executor's
comparison equivalence rather than rounding close real values to six decimals.
Unsupported or ambiguous affinity/key shapes fall back to a scan.

Range predicates, arbitrary expressions, sorting, and leading columns of a
multi-column index do not acquire a general index-scan plan from this heuristic.
Other specialized execution paths may have narrower optimizations; use tested
query behavior rather than assuming PostgreSQL planner coverage.

## Bounded scans

A simple autocommit SELECT with direct column/literal/wildcard projections and a
literal non-negative LIMIT/OFFSET can stop its scan after enough matching rows:

```sql
SELECT id FROM users LIMIT 10;
SELECT id FROM users WHERE active = true LIMIT 10 OFFSET 20;
```

OFFSET and LIMIT are applied once in the final result path. Queries with aliases,
JOINs, sorting, grouping, DISTINCT, windows, subquery projections, or unsupported
limit expressions retain the full path. Explicit transactions also retain their
complete overlay/read-set validation; this optimization does not weaken phantom
protection. Without ORDER BY, no stable SQL result ordering is promised.

## UNIQUE ownership caches

Column-based UNIQUE constraints build a constraint-encoded value→durable-row-key
ownership map on first validation. Warm validations no longer rescan all rows.
Composite keys, numeric normalization, NULL exemptions, key replacement, and
multi-row swaps use the existing constraint semantics—not the coarser SELECT
candidate-key encoder.

Changes are prepared and validated under the table's exclusive publication gate,
then applied only after durable commit. Rollback, compare conflicts, DDL, restart,
and ambiguous transport errors cannot publish speculative ownership. Expression
UNIQUE constraints retain scan validation until evaluator determinism is proven.
See [Constraints](/sql-reference/constraints/).

## Cache lifetime and write amplification

- Cold lookup or ownership caches pay a durable scan to rebuild. They are not
  persisted index pages and do not require a storage migration.
- Direct point writes maintain warm lookup entries. Exclusive-gate commits also
  update warm column lookup maps and exact counts incrementally.
- Shared-gate optimistic commits still invalidate read caches: their derived
  state must not be published out of durable CAS order. Expression read indexes
  are invalidated rather than assuming deterministic evaluation.
- Indexed reads fetch the matching row values from KV. There is no all-row value
  cache that turns ordinary unindexed scans into memory-only reads.

Create indexes for tested equality lookups and enforced uniqueness. Do not assume
that adding a composite index will accelerate ranges, sorting, or arbitrary JOINs.
