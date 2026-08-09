# Kaffelog — concept

Kaffelog is a single-page app for people who brew coffee at home and want to get
better at it. You log each brew (method, beans, grind, water, time), rate the
result, and Kaffelog shows you what actually makes your coffee better.

**Who it is for:** home brewers with a scale and opinions.
**What it is not:** a social network, a shop, or a bean database.

## Core loop

Log a brew (20 seconds) → rate it (1 tap) → see patterns (stats view).

## Principles

1. Logging must be faster than brewing.
2. Your data is yours: local-first, exportable, no accounts.
3. Opinionated defaults, everything overridable.

## Changelog

- 2026-07-02 — Initial concept written.
- 2026-07-09 — Scope cut: no bean-shop integration in v1 (see ADR-002).
- 2026-07-21 — Ratings changed from 1–10 to 1–5 after test brews; 10 levels was
  false precision.
