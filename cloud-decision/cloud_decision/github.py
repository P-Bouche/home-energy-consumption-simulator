"""Pure helpers for GitHub webhook payloads and REST access.

Kept free of SDK imports so they can be unit-tested with plain pytest,
without mistralai-workflows installed.
"""

from __future__ import annotations

import base64
from typing import Any

DEFAULT_LABEL = "decision-request"


def target_from_webhook(payload: dict[str, Any], label: str = DEFAULT_LABEL) -> dict | None:
    """Extract {owner, repo, issue_number} from a GitHub webhook request.

    Accepts issue events (opened/labeled/reopened/edited) where the issue
    carries the trigger label. Returns None when the event is irrelevant,
    so the workflow can end quietly without burning model calls.
    """
    body = (payload or {}).get("body") or {}
    if not isinstance(body, dict):
        return None
    action = body.get("action")
    repo = body.get("repository") or {}
    issue = body.get("issue") or {}
    full_name = repo.get("full_name")
    number = issue.get("number")
    if not full_name or not isinstance(number, int):
        return None
    labels = [l.get("name") for l in issue.get("labels") or [] if isinstance(l, dict)]
    if label not in labels:
        return None
    # Ignore label events that concern another label: the target label must
    # be present now, and "labeled" must have added it (or the event is
    # opened/reopened/edited).
    if action == "labeled":
        added = body.get("label") or {}
        if added.get("name") != label:
            # still a valid target (label already present) but not the
            # event that adds it: skip to avoid double analysis.
            return None
    owner, _, repo_name = full_name.partition("/")
    if not repo_name:
        return None
    return {"owner": owner, "repo": repo_name, "issue_number": number}


def normalize_direct_input(owner: str, repo: str, issue_number: int) -> dict | None:
    if not owner or not repo or not isinstance(issue_number, int) or issue_number <= 0:
        return None
    return {"owner": owner, "repo": repo, "issue_number": issue_number}


def decode_contents_entry(entry: dict[str, Any]) -> dict | None:
    """Decode one item of a GitHub contents response.

    Returns {"type": "file"|"dir", "path": str, "text": str|None} for files
    (base64-decoded) or directories (entry list handled by the caller).
    """
    if not isinstance(entry, dict):
        return None
    kind = entry.get("type")
    out = {"type": kind, "path": entry.get("path")}
    if kind == "file" and isinstance(entry.get("content"), str):
        try:
            out["text"] = base64.b64decode(entry["content"]).decode("utf-8", "replace")
        except Exception:
            out["text"] = None
    return out


PLANNER_INSTRUCTIONS = """
You are the PLANNER of a hosted decision-only pipeline (Mistral side of
P-Bouche/home-energy-consumption-simulator kit harness-poc).

Expertise: senior web architect, TypeScript monorepos, React + MUI frontends,
NestJS backends, three.js, Vitest/Playwright testability.

Your mission, for the issue you are given:
1. Explore the codebase through your tools (read_issue_file to read source
   files, list_issue_dir to list directories). Cite the files you read.
2. Produce a feasibility analysis grounded in this codebase.
3. A single line: RECOMMENDATION: <choice> justified in the bullet points.
4. Remaining decision points for the maintainer.
5. End with an "### Open questions" section (empty if none).

Strict prohibitions: do not implement anything, do not modify any file,
do not invent files or APIs you did not read. If the code needed to answer is
not accessible, say so instead of guessing. Keep the answer under 600 words.
"""
