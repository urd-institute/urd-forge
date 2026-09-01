---
id: SPEC-05
title: Read-only share link
status: draft
depends_on: [SPEC-03]
blocks: []
topics: [sharing, export]
---

# SPEC-05 — Read-only share link

## Purpose
Share a single brew (with its stats context) without accounts or a server.

## Constraint
ADR-001 (no backend) means the brew must be encoded in the URL itself.
Open question: URL length limits vs. amount of context shared.
