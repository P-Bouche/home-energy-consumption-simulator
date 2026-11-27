# Parallel agent work: worktrees and ports

Rules for running several agent sessions on this repo at the same time. The
failure mode they prevent: two sessions sharing one checkout, where one
session's `git stash` / `git checkout` / `git reset` silently discards the
other's uncommitted work.

## One worktree per session

- **Never share the main checkout between sessions.** Each agent session
  creates its own git worktree on its own issue branch, based on
  `origin/main`:

  ```bash
  git fetch origin
  git worktree add /tmp/wt-<issue> -b feature/issue-<N>-<slug> origin/main
  ```

  (Vibe-managed worktrees under `~/.vibe/worktrees/<repo-bucket>/<name>/`
  work the same way.)

- The main checkout is for human review and merging only.
- A worktree is a fresh checkout without `node_modules`: run `npm ci` in it,
  or symlink the installs from the main checkout (fine for running tests; use
  `npm ci` if you add or change dependencies):

  ```bash
  ln -s "$MAIN/node_modules" /tmp/wt-<issue>/node_modules
  ln -s "$MAIN/apps/web/node_modules" /tmp/wt-<issue>/apps/web/node_modules
  ```

- Lifecycle: implement and commit **in the worktree**, push the branch, open
  the PR (`Closes #N`). After merge: `git worktree remove /tmp/wt-<issue>`
  and delete the branch (`git branch -D …` — squash-merged PRs leave the
  original commits unreferenced).

## Ports: one set per worktree

Dev servers and e2e bind fixed ports by default; two worktrees on the same
ports collide (or worse, silently reuse each other's servers). All ports are
env-driven:

| What | Env var | Default | Where |
| --- | --- | --- | --- |
| API port | `API_PORT` | `3000` | `apps/api/src/config.ts` |
| API CORS origin | `CORS_ORIGIN` | `http://localhost:5173` | `apps/api/src/config.ts` |
| Web dev server port | `WEB_PORT` | `5173` | `apps/web/vite.config.ts` (also `strictPort`: a collision fails loudly) |
| Vite `/api` proxy target | follows `API_PORT` | `http://localhost:3000` | `apps/web/vite.config.ts` |
| Playwright baseURL + webServer | follows `API_PORT` / `WEB_PORT` | `3000` / `5173` | `playwright.config.ts` |

Rules of thumb:

- Run e2e (`npm run test:e2e`) in **one worktree at a time**, or give each
  worktree its own ports, e.g. `API_PORT=3080 WEB_PORT=5180 npm run test:e2e`.
- Never rely on `reuseExistingServer` (on outside CI) across worktrees: it
  reuses whatever already listens on the port, which may be another
  worktree's code.
- Same for manual dev servers: `API_PORT=3080 npm run dev:api` and
  `WEB_PORT=5180 API_PORT=3080 npm run dev:web` in a worktree.

## Quick checklist for a new parallel session

1. `git fetch origin` and branch off `origin/main` in a **new worktree**.
2. Dependencies: `npm ci` or symlink `node_modules`.
3. Pick free ports (`API_PORT`, `WEB_PORT`) if you will run servers/e2e.
4. Commit early and often **inside the worktree** — uncommitted work is what
   gets lost when checkouts are shared.
