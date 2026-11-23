# Multi-agent Mistral harness PoC for code

This kit implements recommendation #1 of the research report: a proof of concept
that chains four roles (planner, coder, tester, human approval assisted by a
reviewer agent), removing the copy-pasting of prompts between agents.

## Kit layout

```
.vibe/
  config.toml              # Project configuration for the mistral-vibe CLI
  agents/
    planner.toml           # Strictly read-only, produces the plan
    coder.toml             # File editing + restricted shell (allowlist)
    tester.toml            # Shell limited to npm test / test:coverage / test:e2e
    reviewer.toml          # Read-only review, formatted recommendation
harness-poc/
  orchestrate_poc.py       # The orchestrator (Python, no external dependency)
  README.md                # This file
  JOURNAL.md               # Append-only run journal (the state, versioned)
  TASKS.md                 # Backlog of tasks to run
  tasks/                   # Task sheets written as runs happen
  plans/                   # Plans produced by the planner
.poc-worktrees/            # Isolated worktrees (created on the first run, gitignored)
```

## 1. Installation (once)

A Linux environment is recommended (WSL2 Ubuntu): the CLI ships unsigned
binaries blocked by Smart App Control on Windows.

```bash
curl -LsSf https://astral.sh/uv/install.sh | bash
uv tool install --python 3.14 mistral-vibe
vibe --help
```

On native Windows (only if Smart App Control is off - a decision to weigh,
since it cannot be undone):

```powershell
irm https://astral.sh/uv/install.ps1 | iex
uv tool install --python-preference only-system --python 3.14 mistral-vibe
```

Authentication: run `vibe` once in the project folder and sign in with your
Mistral account (or your La Plateforme API key). Available models are listed
with `/model` in the interactive session.

## 2. Checks before the first run

1. **Model**: in an interactive `vibe` session, type `/model`. If a Devstral
   model is listed, set it as `active_model` in `.vibe/config.toml`
   (or uncomment the preset in that file). Otherwise `mistral-medium-latest`
   runs the PoC.
2. **Folder trust**: the project-level `.vibe/` configuration is only loaded
   if the folder is trusted. It is, if you have already opened `vibe` in the
   project and accepted.
3. **Tester role alone** (tests the PoC without the orchestrator):

   ```bash
   vibe --agent tester --prompt "Run npm test and give your verdict." --max-price 1
   ```

   The tester must run the tests and answer `VERDICT: PASS` or
   `VERDICT: FAIL`. This is the key feasibility test of the PoC.

## 3. Run a full pipeline

From the project root:

```bash
uv run harness-poc/orchestrate_poc.py "Add the weekly usage breakdown chart to the dashboard"
```

Automatic flow:

```
planner (read-only)  ->  plan saved  ->  [capped by --max-price]
        |____ human approval of the plan (terminal)
coder (isolated worktree)  ->  tester (npm test)  ->  on FAIL: loop (max --iterations)
        |____ reviewer review (read-only)
        |____ final human approval -> commit on the poc-... branch
```

Useful options:

| Option | Effect |
| :--- | :--- |
| `--iterations 2` | Max coder->tester rounds (default 2) |
| `--price-code 2` | Price cap in dollars per coder round |
| `--skip-review` | Skip the reviewer step |
| `--skip-install` | Skip npm install if the worktree already has node_modules |
| `--no-worktree` | Branch in place instead of a worktree (less isolated: discouraged) |

Default budgets: plan 1 $, code 2 $/round, test 0.75 $, review 0.75 $ -
a theoretical cap of about 7.50 $ for a 2-round run. Read `JOURNAL.md` after
each run and check that the actual billed price matches expectations.

## 4. Security built into the kit

- Each role is an **agent profile** with its own permissions, not a prompt
  copied by hand: the tester can physically only run the commands in its
  allowlist; the planner and the reviewer cannot modify anything.
- In programmatic mode, any unauthorized tool call is **denied and reported**
  to the agent instead of waiting for a human. Never use `--auto-approve`
  outside a sandbox (the kit does not need it).
- Every step is capped (`--max-price`, `--max-turns`), and the whole run
  happens in an **isolated git worktree**: your current branch is never
  touched, and nothing is committed without your `[y]` in the terminal.
- **Commit the kit before playing with branches**: untracked files disappear
  at the first working-tree cleanup.

## 5. Troubleshooting

| Symptom | Likely cause / fix |
| :--- | :--- |
| `vibe` not found | Restart the shell after the uv install; `uv tool update-shell` |
| WinError 4551 / 0xc0e90002 on Windows | Smart App Control blocks the unsigned binaries: use WSL2, or turn SAC off (irreversible) |
| Agents behave "generically" | `.vibe/` not loaded: untrusted folder. Open `vibe` interactively in it, accept. For a worktree: `vibe --workdir <path>` once, accept, relaunch the run |
| Tester answers without `VERDICT:` | Truncated answer or weak model: relaunch, or raise `--price-test` |
| npm test fails in the worktree | Missing `node_modules`: let the `npm install` step run (or `--skip-install` after) |

## 6. After the PoC: the next stages

1. **Validation** (this kit): one run per task, human at the terminal.
2. **Durable state**: the journal and task sheets already live in the repo;
   add crash recovery (re-read JOURNAL.md + plan and relaunch).
3. **Real cost tracking**:** log the billed cost next to the cap for each run,
   adjust the budgets.
4. **Reusability**: once the profiles are stable, copy the generic ones to
   `~/.vibe/agents/` (valid for all your projects) and keep only the
   overrides at project level (test allowlists, stack instructions).
5. **Queues**: only if the volume justifies it, study Archon (option A of the
   report) with a custom provider around this same
   `vibe --prompt-file --output json`.
