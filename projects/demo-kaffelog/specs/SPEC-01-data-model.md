---
id: SPEC-01
title: Brew data model and storage
status: done
depends_on: []
blocks: [SPEC-02, SPEC-04]
---

# SPEC-01 — Brew data model and storage

## Purpose
Define the brew entry, the rating, and the versioned localStorage schema.

## Decisions
A brew is immutable once saved (invariant 2). Fields: id, timestamp, method
(enum: v60, aeropress, frenchpress, espresso, other), beans (free text, ADR-002),
dose_g, water_g, grind (free text), time_s, rating (int 1–5, ADR-003), notes.
Schema is versioned; migrations run on load (v1→v2 shipped).

## Definition of Done
Storage module with typed API, schema version check, migration test passing.
