# Security policy

URD Forge is a **local tool**: it binds to `127.0.0.1` only and is meant to
run on your own machine for your own project files. It is not a hosted
service and must not be exposed to a network — see the "Security" section of
the README for what the design does and does not protect against.

## Supported versions

Only the latest release on the `main` branch receives fixes. Update from the
**Updates** screen inside Forge (or `git pull` + `npm install` +
`npm run build`).

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private reporting instead: **Security → Report a vulnerability**
on https://github.com/urd-institute/urd-forge. Include the version (shown in
the sidebar), your OS, steps to reproduce and what an attacker could achieve.

You will get an acknowledgement within a week. Fixes for confirmed issues are
released as a new version and noted in the release; you will be credited
unless you prefer not to be.

## Scope

In scope:

- Anything that lets a web page on another origin talk to a running Forge
  (cross-origin reads or writes, WebSocket hijacking, DNS rebinding).
- Path traversal out of the `projects/` directory through any route.
- Command execution through the HTTP API, preset validation bypass, or
  injection into the command lines Forge builds for agent runs.
- Zip import escaping its target folder (zip-slip) or overwriting files.
- Self-update doing anything other than a clean fast-forward of the
  official repository.

Out of scope:

- Running Forge on a shared machine or exposing its port to a network.
  Forge assumes the local user is trusted.
- What Claude Code (or any other tool started from the terminal panel) does
  once it is running — that is governed by that tool's own permission model.
- Vulnerabilities in third-party dependencies that are not reachable from
  Forge's code paths (report those upstream; Dependabot tracks them here).
