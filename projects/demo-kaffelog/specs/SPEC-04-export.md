---
id: SPEC-04
title: Export and import
status: draft
depends_on: [SPEC-01]
blocks: []
topics: [data, export]
---

# SPEC-04 — Export and import

## Purpose
Data freedom (principle 3): full export to CSV and JSON, import with validation.

## Sketch
Export includes schema version. Import validates against current schema and
runs migrations if the file is older. Duplicates detected by id.
