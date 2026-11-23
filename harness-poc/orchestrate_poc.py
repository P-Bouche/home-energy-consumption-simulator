#!/usr/bin/env python3
"""Multi-agent Mistral harness PoC - orchestrator.

Chains planner -> coder -> tester -> (optional) reviewer -> human approval,
driving the mistral-vibe CLI in programmatic mode. Every step is capped in
price and in turns.

Usage:
    uv run harness-poc/orchestrate_poc.py "Description of the task" [options]

Important:
    - Run this script from the git repository root.
    - The `vibe` CLI must be installed and authenticated (see harness-poc/README.md).
    - Restricted shell: no command outside the allowlists of the agent profiles
      (.vibe/agents/) can run; anything else is denied in programmatic mode.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# --- Robust console output (accents in agent replies) ------------------------
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

VIBE = shutil.which("vibe") or "vibe"
JOURNAL = Path("harness-poc/JOURNAL.md")
PLANS_DIR = Path("harness-poc/plans")
TASKS_DIR = Path("harness-poc/tasks")
VERDICT_RE = re.compile(r"VERDICT:\s*(PASS|FAIL)", re.IGNORECASE)


def stamp() -> str:
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def slugify(text: str, maxlen: int = 24) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return (s[:maxlen].rstrip("-")) or "task"


def header(msg: str) -> None:
    print(f"\n{'=' * 70}\n{msg}\n{'=' * 70}", flush=True)


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", **kw)


def git(*args: str) -> subprocess.CompletedProcess:
    return run(["git", *args])


def journal_append(text: str) -> None:
    JOURNAL.parent.mkdir(parents=True, exist_ok=True)
    with JOURNAL.open("a", encoding="utf-8") as f:
        f.write(text.rstrip() + "\n")


def run_vibe(workdir: Path, agent: str, prompt: str, max_price: float,
             max_turns: int) -> tuple[int, str]:
    """Call the CLI in programmatic mode, return (exit code, final text).

    The prompt goes through --prompt-file: immune to command-line argument
    length limits on Windows, and to embedded newlines.
    """
    fd, prompt_path = tempfile.mkstemp(suffix=".md", prefix="harness-poc-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(prompt)
        cmd = [
            VIBE, "--workdir", str(workdir),
            "--agent", agent,
            "--output", "text",
            "--max-price", f"{max_price:.2f}",
            "--max-turns", str(max_turns),
            "--prompt-file", prompt_path,
        ]
        print(f"\n$ vibe --workdir {workdir} --agent {agent} --max-price {max_price:.2f} "
              f"--max-turns {max_turns} --prompt-file <{len(prompt)} chars>", flush=True)
        p = run(cmd)
    finally:
        os.unlink(prompt_path)
    if p.stdout:
        print(p.stdout)
    if p.returncode != 0 and p.stderr:
        print(f"[stderr] {p.stderr[:2000]}", file=sys.stderr)
    return p.returncode, p.stdout or ""


def parse_verdict(text: str) -> str | None:
    matches = VERDICT_RE.findall(text)
    return matches[-1].upper() if matches else None


def ask(label: str, choices: str = "[y]es / [n]o") -> str:
    return input(f"{label} {choices} > ").strip().lower()


def yes(gate: str) -> bool:
    return gate in ("y", "yes", "o", "oui")


def commit_kit_once() -> None:
    """The kit (.vibe, harness-poc) must be tracked by git to exist in a worktree."""
    s = git("status", "--porcelain", "--", ".vibe", "harness-poc")
    if s.stdout.strip():
        header("Step 0: commit harness kit (first run)")
        git("add", ".vibe", "harness-poc")
        p = git("commit", "-m", "chore(harness-poc): multi-agent Mistral orchestration kit")
        print((p.stdout or p.stderr or "").strip()[:500])
        if p.returncode != 0:
            sys.exit("Could not commit the kit (clean, up-to-date repo?). Aborting.")


def setup_worktree(slug: str, worktrees_root: Path) -> Path:
    branch = f"poc-{dt.date.today():%Y%m%d}-{slug}"
    wt = worktrees_root / f"{branch}"
    wt.parent.mkdir(parents=True, exist_ok=True)
    if wt.exists():
        sys.exit(f"Worktree already exists: {wt}. Remove it or retry later.")
    p = git("worktree", "add", "-b", branch, str(wt))
    if p.returncode != 0:
        print((p.stderr or "").strip()[:500])
        sys.exit("Could not create the worktree. Retry with --no-worktree to work in place.")
    return wt


def npm_install(wt: Path) -> None:
    header("Installing worktree dependencies (npm install)")
    print("This step can take a few minutes...", flush=True)
    p = run(["npm", "install"], cwd=str(wt), shell=True)
    print(p.stdout or "", end="")
    if p.returncode != 0:
        print(p.stderr or "", end="", file=sys.stderr)
        sys.exit("npm install failed in the worktree. Aborting.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Mistral multi-agent harness PoC via the vibe CLI.")
    ap.add_argument("task", help="Description of the task to plan then implement.")
    ap.add_argument("--iterations", type=int, default=2,
                    help="Maximum coder->tester rounds (default 2).")
    ap.add_argument("--price-plan", type=float, default=1.00,
                    help="Price cap in dollars for the planner step.")
    ap.add_argument("--price-code", type=float, default=2.00,
                    help="Price cap in dollars per coder round.")
    ap.add_argument("--price-test", type=float, default=0.75,
                    help="Price cap in dollars per tester round.")
    ap.add_argument("--price-review", type=float, default=0.75,
                    help="Price cap in dollars for the reviewer step.")
    ap.add_argument("--no-worktree", action="store_true",
                    help="Work on a branch in place instead of a worktree (less isolated).")
    ap.add_argument("--skip-review", action="store_true",
                    help="Skip the reviewer agent step.")
    ap.add_argument("--skip-install", action="store_true",
                    help="Skip npm install in the worktree (node_modules already present).")
    args = ap.parse_args()

    if git("rev-parse", "--is-inside-work-tree").returncode != 0:
        sys.exit("Not inside a git repository. Run this script from the project root.")

    slug = slugify(args.task)
    header(f"Mistral harness PoC - task: {args.task}")
    print(f"Per-step price caps: plan {args.price_plan} $ | code {args.price_code} $ | "
          f"test {args.price_test} $ | review {args.price_review} $")
    budget_total = (args.price_plan
                    + args.iterations * (args.price_code + args.price_test)
                    + args.price_review)
    print(f"Theoretical maximum budget for this run: {budget_total:.2f} $")

    commit_kit_once()

    if args.no_worktree:
        workdir = Path.cwd().resolve()
        branch = f"poc-{dt.date.today():%Y%m%d}-{slug}"
        git("checkout", "-b", branch)
    else:
        worktrees_root = Path.cwd().resolve() / ".poc-worktrees"
        workdir = setup_worktree(slug, worktrees_root)
        if not args.skip_install:
            npm_install(workdir)
        print(f"\nWorktree ready: {workdir}")
        print("If the vibe CLI then reports an 'untrusted' folder, open an interactive "
              "session once with `vibe --workdir` on it, accept, then relaunch.")

    plans_dir = workdir / PLANS_DIR
    plans_dir.mkdir(parents=True, exist_ok=True)
    plan_file = plans_dir / f"{slug}.md"
    tasks_dir = workdir / TASKS_DIR
    tasks_dir.mkdir(parents=True, exist_ok=True)
    task_file = tasks_dir / f"{slug}.md"
    task_file.write_text(
        f"# Task (repo copy, {dt.date.today():%Y-%m-%d})\n\n{args.task}\n", encoding="utf-8")

    # -- 1. PLANNING -----------------------------------------------------------
    header("Step 1: PLANNER (read-only)")
    code, plan_txt = run_vibe(
        workdir, "planner",
        f"Task to plan (also written in harness-poc/tasks/{slug}.md):\n\n"
        f"{args.task}\n\n"
        "Explore the codebase and produce the full plan, following your instructions.",
        args.price_plan, 25)
    if code != 0 or not plan_txt.strip():
        journal_append(f"## {stamp()} - {slug} - FAILED planning (exit {code})")
        sys.exit("Planning failed (see output above). Run cancelled, nothing was modified.")
    plan_file.write_text(plan_txt, encoding="utf-8")
    print(f"\nPlan saved: {plan_file}")

    gate = ask("\nApprove this plan? (otherwise the run stops without changing anything)",
               "[y]es / [n]o")
    if not yes(gate):
        journal_append(f"## {stamp()} - {slug} - plan not approved by the human. Run cancelled.")
        print("Run cancelled: nothing modified (the worktree can be removed).")
        return

    # -- 2/3. CODER -> TESTER LOOP ---------------------------------------------
    verdict = "FAIL"
    failure_report = ""
    for round_no in range(1, args.iterations + 1):
        header(f"Step 2 (round {round_no}/{args.iterations}): CODER")
        if round_no == 1:
            coder_prompt = (
                f"Task: {args.task}\n"
                f"The approved plan is in harness-poc/plans/{slug}.md: read it, then "
                "implement it fully, following your instructions.")
        else:
            coder_prompt = (
                f"Task: {args.task}\n"
                f"The approved plan is in harness-poc/plans/{slug}.md.\n"
                f"The tester reported failures in the previous round. Fix them, then "
                f"verify with the allowlisted tests.\n\n--- Tester report ---\n{failure_report}")
        code, _ = run_vibe(workdir, "coder", coder_prompt, args.price_code, 50)
        if code != 0:
            print("The coder exited with an error code, but we still run the tests.")

        header(f"Step 3 (round {round_no}/{args.iterations}): TESTER")
        code, test_txt = run_vibe(
            workdir, "tester",
            f"The following task was just implemented: {args.task}\n"
            "Run `npm test` (and `npm run test:e2e` if relevant), then give your verdict "
            "exactly in the required format.",
            args.price_test, 25)
        verdict = parse_verdict(test_txt) or "FAIL"
        if verdict == "FAIL" and not test_txt.strip():
            print("Empty or unreadable tester response.")
        print(f"\n>>> Verdict retained: {verdict}")
        if verdict == "PASS":
            break
        if round_no < args.iterations:
            failure_report = test_txt[-4000:]

    if verdict != "PASS":
        gate = ask("Coder->tester rounds exhausted without green tests.\n"
                   "Still continue up to the review step?", "[y]es / [n]o (abort)")
        if not yes(gate):
            journal_append(f"## {stamp()} - {slug} - FAILED: tests not passing after "
                           f"{args.iterations} rounds. Worktree kept for inspection.")
            print("Run aborted. The worktree (and its code) is kept for inspection.")
            return

    # -- 4. REVIEW (optional) ----------------------------------------------------
    if not args.skip_review:
        header("Step 4: REVIEWER (read-only)")
        code, review_txt = run_vibe(
            workdir, "reviewer",
            f"Implemented task: {args.task}\n"
            f"Plan: harness-poc/plans/{slug}.md. Tester verdict: {verdict}.\n"
            "Re-read the modified files (listed in the plan and in your prompt) and "
            "give your formatted recommendation.",
            args.price_review, 30)
        print(review_txt or "(no output)")

    # -- 5. HUMAN APPROVAL --------------------------------------------------------
    header("Step 5: HUMAN APPROVAL")
    diff = git("-C", str(workdir), "diff", "--stat")
    print(diff.stdout or "(git diff --stat empty: check that files actually changed)")
    gate = ask("\nApprove and commit these changes on the PoC branch?", "[y]es / [n]o")
    if not yes(gate):
        journal_append(f"## {stamp()} - {slug} - NOT APPROVED by the human at the final gate. "
                      f"Test verdict: {verdict}. Worktree kept.")
        print("Changes not committed; worktree kept for inspection.")
        return

    p = git("-C", str(workdir), "add", "-A")
    p = git("-C", str(workdir), "commit", "-m",
            f"poc({slug}): {args.task}\n\nGenerated by the PoC harness ({verdict} on tests).")
    if p.returncode != 0:
        print((p.stderr or p.stdout or "commit failed").strip()[:500])
        sys.exit("Could not commit on the PoC branch.")
    branch_final = git("-C", str(workdir), "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    print(f"\nCommitted on branch: {branch_final}")

    journal_append(
        f"## {stamp()} - {slug}\n"
        f"- Task: {args.task}\n"
        f"- Test verdict: {verdict} (rounds: {args.iterations})\n"
        f"- Branch: {branch_final}\n"
        f"- Plan: harness-poc/plans/{slug}.md\n")
    header("Done")
    print("Next manual actions (diff review / PR):")
    print(f"  git -C '{workdir}' log -p --stat")
    print(f"  then merge when you want: git merge {branch_final}  (and worktree removal: "
          f"git worktree remove '{workdir}')")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted by the user.")
        sys.exit(130)
    except FileNotFoundError as e:
        sys.exit(f"Command not found: {e}. Check the installation (see harness-poc/README.md).")
