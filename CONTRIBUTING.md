# Contributing to URD Forge

Thanks for your interest. Forge is small on purpose: it is **the reader, not
another standard**, and contributions should keep it that way.

## Ground rules

- **The files are the database.** Forge reads project files and never edits
  the ones a user wrote. Derived state lives only in `.forge/`, local
  installation state in `forge.state.json`.
- **Localhost only.** No feature may require exposing Forge to a network, and
  no HTTP route may execute commands. Terminal commands go over the
  WebSocket, presets are validated server-side.
- **Tolerant parsing.** A file that deviates from the Forge format is shown
  as "could not be parsed" — it never breaks the UI.
- **English UI**, paper-and-ink design tokens (see `app/client/src/styles.css`).

## Getting started

```bash
git clone https://github.com/urd-institute/urd-forge.git
cd urd-forge
npm install
npm run forge        # http://localhost:4400
```

The server is `app/server/` (ES modules, Express + ws + node-pty). The client
is `app/client/src/` (React, hash routing, built with Vite via `npm run
build`). The shared parser lives in `packages/reader-core/`.

For development, copy `forge.config.example.yaml` to `forge.config.yaml`,
pick a different port, and set `updates: false` so your working copy never
pulls over uncommitted changes.

## Pull requests

1. Open an issue first for anything beyond a small fix, so we can agree on
   the shape before you build it.
2. Keep the change focused. Update `app/client/src/help.md` (the in-app
   guide) and the README when behaviour visible to users changes.
3. Bump `version` in `package.json` (semver: patch for fixes, minor for
   features) — the Updates screen shows it to users.
4. Write commit messages in English, in the imperative ("Add …", "Fix …").
5. Test against the demo project (`projects/demo-kaffelog`) and make sure
   `npm run build` succeeds.

By contributing you agree that your contribution is licensed under the
[Apache-2.0 license](LICENSE). The names **URD FORGE** and **URD Institute**
are trademarks and not covered by that license — see
[TRADEMARKS.md](TRADEMARKS.md).

## Reporting security issues

See [SECURITY.md](SECURITY.md) — please do not open public issues for
vulnerabilities.
