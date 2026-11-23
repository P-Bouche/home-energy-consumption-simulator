#!/usr/bin/env python3
"""Live, readable view of what a vibe CLI agent is doing.

Watches the most recently active session journal under
~/.vibe/logs/session/unified/ and prints one readable line per event:
thinking, tool calls, approvals (allowed/denied), process runs (npm test...)
and their exit codes.

Usage (from a second terminal, while the orchestrator or any vibe run works):
    python3 harness-poc/watch_vibe.py            # follow most recent session
    python3 harness-poc/watch_vibe.py --replay   # print history and exit
    python3 harness-poc/watch_vibe.py --id DIR   # a specific session dir

Journal format (mistral-vibe "unified" engine): one JSON object per line
with a `type` and a `payload`. The interesting events are projection_delta
(user entries, reasoning entries, tool display), callback_registered /
callback_resolved (approvals), process_operation_dispatched /
process_state_changed (actual command runs). The rest (core_input,
action_intent/result for hooks and completions, set_envelope snapshots) is
internal plumbing and filtered out.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

UNIFIED = Path.home() / ".vibe/logs/session/unified"
SNIPPET = 200

QUIET_TYPES = {
    "core_input", "action_intent", "action_result",
    "receipt_succeeded",
}


# ---------------------------------------------------------------- extractors

def first_text(entry: dict) -> str:
    """Find the human-readable text inside an entry (several possible shapes)."""
    for key in ("text", "summary", "message"):
        v = entry.get(key)
        if isinstance(v, str) and v.strip():
            return v
    content = entry.get("content")
    if isinstance(content, list):
        parts = [c.get("text") for c in content
                 if isinstance(c, dict) and isinstance(c.get("text"), str)]
        if parts:
            return " ".join(parts)
    return ""


def describe_entry(entry: dict) -> str | None:
    """A session entry from a projection_delta."""
    eid = str(entry.get("id") or "")

    if eid.startswith("reasoning-"):
        txt = first_text(entry) or json.dumps(entry)[:SNIPPET]
        return f"THINKING | {txt[:SNIPPET]}"

    if eid.startswith("user-turn-"):
        txt = first_text(entry) or json.dumps(entry)[:SNIPPET]
        return f"USER     | {txt[:SNIPPET]}"

    detail = entry.get("detail")
    if isinstance(detail, dict):
        display = detail.get("display") or {}
        message = display.get("message") or "?"
        status = display.get("statusText") or display.get("settledVerb") or ""
        return f"TOOL     | {message:<22} | {status}"

    if "message" in entry or "assistant" in eid or "answer" in eid:
        return f"AGENT    | {first_text(entry)[:SNIPPET]}"

    return None  # unknown/empty entry shapes are skipped silently


def describe_event(etype: str, payload: dict) -> str | None:
    """A top-level journal event."""

    if etype == "projection_delta":
        out = []
        for delta in (payload.get("delta") or []):
            if not isinstance(delta, dict):
                continue
            entry = delta.get("entry")
            if isinstance(entry, dict):
                line = describe_entry(entry)
                if line:
                    out.append(line)
        return "\n".join(out) if out else None

    if etype == "callback_registered":
        if payload.get("kind") == "approval":
            return "APPROVAL | requested (headless run -> will be denied)"

    if etype == "callback_resolved":
        decision = (payload.get("result", {}).get("output", {})
                    .get("decision", {}).get("type"))
        if decision:
            return f"APPROVAL | {decision.upper()}"

    if etype == "process_operation_dispatched":
        start = payload.get("prepared_start") or {}
        command = start.get("command")
        if isinstance(command, str) and command:
            return f"RUN      | $ {command}"

    if etype == "process_state_changed":
        proc = payload.get("process") or {}
        exit_code = proc.get("exit_code")
        command = proc.get("command")
        if exit_code is not None and isinstance(command, str):
            state = "OK" if exit_code == 0 else f"EXIT {exit_code}"
            return f"DONE     | {command}  [{state}]"

    return None


# ---------------------------------------------------------------- watcher core

def journal_files(session: Path) -> list[Path]:
    return sorted(session.glob("journal/*.jsonl"))


def pick_session() -> Path:
    if not UNIFIED.exists():
        sys.exit(f"No session directory at {UNIFIED}. Run a vibe session first.")
    best: tuple[float, Path] | None = None
    for d in UNIFIED.iterdir():
        files = journal_files(d)
        if files:
            mtime = max(f.stat().st_mtime for f in files)
            if best is None or mtime > best[0]:
                best = (mtime, d)
    if best is None:
        sys.exit("No session journal found.")
    return best[1]


def main() -> None:
    ap = argparse.ArgumentParser(description="Readable live view of a vibe session journal.")
    ap.add_argument("--id", help="Specific session directory name under ~/.vibe/logs/session/unified/.")
    ap.add_argument("--replay", action="store_true", help="Print the existing history and exit.")
    args = ap.parse_args()

    session = (UNIFIED / args.id) if args.id else pick_session()
    if not session.is_dir():
        sys.exit(f"No such session: {session}")
    print(f"Session: {session.name}"
          f"{'' if args.replay else '  (following live, Ctrl+C to stop)'}\n", flush=True)

    offsets: dict[Path, int] = {}
    try:
        while True:
            for jf in journal_files(session):
                with jf.open(encoding="utf-8", errors="replace") as f:
                    f.seek(offsets.get(jf, 0))
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            obj = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        etype = obj.get("type") or ""
                        if etype in QUIET_TYPES:
                            continue
                        line_out = describe_event(etype, obj.get("payload") or {})
                        if line_out:
                            print(line_out, flush=True)
                    offsets[jf] = f.tell()
            if args.replay:
                return
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
