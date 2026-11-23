"""GitHub REST activities, plus the bounded planner agent loop.

Never imported inside the workflow sandbox directly. This module performs
network I/O (httpx, Mistral chat completions) and is imported from the
workflow module under workflow.unsafe.imports_passed_through() only.
Imports are absolute: the sandbox re-imports modules without package context.

v3 (bounded): the planner agent loop lives here, in activity code, instead of
the in-sandbox durable agent (Runner.run + LocalSession), which hung the
workflow inside a single model call. As an activity it is free of sandbox
restrictions and we control every guarantee: at most PLANNER_MAX_TURNS model
calls, each capped at MODEL_CALL_TIMEOUT_S seconds, and any error stops the
run immediately and is reported in the result (no exception, no retry loop).
"""

from __future__ import annotations

import asyncio
import json
import os

import httpx

from mistralai import Mistral

import mistralai.workflows as workflows

from cloud_decision.github import decode_contents_entry

GITHUB_API = "https://api.github.com"
MAX_FILE_CHARS = 60_000
TOOL_RESULT_CHARS = 24_000

# Hard loop bounds: a decision needs a few tool calls, not an endless repo
# walk. Total worst-case planner time is about
# PLANNER_MAX_TURNS * MODEL_CALL_TIMEOUT_S = 8 * 120s = 16 minutes.
PLANNER_MAX_TURNS = 8
MODEL_CALL_TIMEOUT_S = 120
PLANNER_MODEL = "mistral-large-latest"


def _gh_headers(token: str) -> dict[str, str]:
    h = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "cloud-decision-workflow",
    }
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _github_token() -> str:
    # Read from the secret bound to the deployment, when present.
    for name in ("GITHUB_TOKEN", "github_token"):
        v = os.environ.get(name)
        if v:
            return v.strip()
    return ""


@workflows.activity()
async def fetch_issue(owner: str, repo: str, issue_number: int) -> dict:
    """Fetch an issue's title and body from the GitHub REST API.

    Args:
        owner: repository owner
        repo: repository name
        issue_number: issue number
    """
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/issues/{issue_number}",
            headers=_gh_headers(_github_token()),
        )
        r.raise_for_status()
        data = r.json()
    return {
        "title": data.get("title", ""),
        "body": data.get("body") or "",
        "html_url": data.get("html_url", ""),
    }


async def _read_file_raw(client: httpx.AsyncClient, owner: str, repo: str, path: str, ref: str) -> dict:
    r = await client.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}",
        params={"ref": ref},
        headers=_gh_headers(_github_token()),
    )
    r.raise_for_status()
    decoded = decode_contents_entry(r.json())
    if not decoded or decoded["type"] != "file":
        return {"error": f"not a file: {path}"}
    text = decoded.get("text") or ""
    return {
        "path": path,
        "text": text[:MAX_FILE_CHARS],
        "truncated": len(text) > MAX_FILE_CHARS,
    }


async def _list_dir_raw(client: httpx.AsyncClient, owner: str, repo: str, path: str, ref: str) -> dict:
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contents" + (f"/{path}" if path else "")
    r = await client.get(url, params={"ref": ref}, headers=_gh_headers(_github_token()))
    r.raise_for_status()
    entries = r.json()
    if not isinstance(entries, list):
        return {"error": f"not a directory: {path}"}
    return {
        "path": path or ".",
        "entries": [
            {"name": e.get("name"), "type": e.get("type")} for e in entries
        ],
    }


@workflows.activity()
async def read_repo_file(path: str, owner: str, repo: str, ref: str = "main") -> dict:
    """Read one source file from the repository.

    Args:
        path: file path in the repository
        owner: repository owner
        repo: repository name
        ref: branch, tag or commit (default main)
    """
    async with httpx.AsyncClient(timeout=30) as client:
        return await _read_file_raw(client, owner, repo, path, ref)


@workflows.activity()
async def list_repo_dir(path: str, owner: str, repo: str, ref: str = "main") -> dict:
    """List a directory of the repository.

    Args:
        path: directory path in the repository ("" for the root)
        owner: repository owner
        repo: repository name
        ref: branch, tag or commit (default main)
    """
    async with httpx.AsyncClient(timeout=30) as client:
        return await _list_dir_raw(client, owner, repo, path, ref)


@workflows.activity()
async def post_issue_comment(owner: str, repo: str, issue_number: int, body: str) -> dict:
    """Post a comment on the issue. Requires GITHUB_TOKEN; skips otherwise.

    Args:
        owner: repository owner
        repo: repository name
        issue_number: issue number
        body: comment body in Markdown
    """
    token = _github_token()
    if not token:
        return {
            "posted": False,
            "reason": "no GITHUB_TOKEN secret bound to the deployment: "
            "recommendation kept in the execution result only",
        }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{GITHUB_API}/repos/{owner}/{repo}/issues/{issue_number}/comments",
            headers=_gh_headers(token), json={"body": body},
        )
        r.raise_for_status()
    return {"posted": True, "html_url": r.json().get("html_url", "")}


_PLANNER_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a repository file on the main branch.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "file path in the repository",
                    }
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_dir",
            "description": (
                "List a repository directory on the main branch "
                "('' for the repository root)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "directory path, '' for the repository root",
                    }
                },
                "required": ["path"],
            },
        },
    },
]


async def _dispatch_tool(client: httpx.AsyncClient, owner: str, repo: str, name: str, args: dict) -> dict:
    path = str(args.get("path", "") or "")
    if name == "read_file":
        return await _read_file_raw(client, owner, repo, path, "main")
    if name == "list_dir":
        return await _list_dir_raw(client, owner, repo, path, "main")
    return {"error": f"unknown tool: {name}"}


@workflows.activity()
async def run_planner(
    owner: str,
    repo: str,
    issue_number: int,
    title: str,
    body: str,
    instructions: str,
) -> dict:
    """Run the bounded decision-only planner agent loop.

    Guarantees (fail fast, no retry):
      - at most PLANNER_MAX_TURNS model calls, each with a hard
        MODEL_CALL_TIMEOUT_S timeout;
      - the only tools are read_file / list_dir on the main branch;
      - any error (timeout, API error, bad tool call) stops the loop and is
        returned as {"error": ...} instead of raising or retrying.

    Args:
        owner: repository owner
        repo: repository name
        issue_number: issue number
        title: issue title
        body: issue body
        instructions: planner system prompt (PLANNER_INSTRUCTIONS)
    """
    messages = [
        {"role": "system", "content": instructions},
        {
            "role": "user",
            "content": (
                f"Issue #{issue_number} ({title}):\n\n{body}\n\n"
                "Analyze feasibility and give your recommendation."
            ),
        },
    ]
    try:
        client = Mistral()
    except Exception as exc:
        return {"error": f"cannot build Mistral client: {type(exc).__name__}: {exc}"[:1000]}

    async with httpx.AsyncClient(timeout=30) as gh:
        for turn in range(1, PLANNER_MAX_TURNS + 1):
            # -- one bounded model call ------------------------------------
            try:
                resp = await asyncio.wait_for(
                    client.chat.complete_async(
                        model=PLANNER_MODEL,
                        messages=messages,
                        tools=_PLANNER_TOOLS,
                    ),
                    timeout=MODEL_CALL_TIMEOUT_S,
                )
            except asyncio.TimeoutError:
                return {
                    "error": f"model call timed out after {MODEL_CALL_TIMEOUT_S}s",
                    "turn": turn,
                }
            except Exception as exc:
                return {
                    "error": f"chat completions failed: {type(exc).__name__}: {exc}"[:1000],
                    "turn": turn,
                }
            if not resp.choices:
                return {"error": "empty model response", "turn": turn}
            msg = resp.choices[0].message
            tool_calls = list(getattr(msg, "tool_calls", None) or [])

            # -- no tool call: the planner is done -------------------------
            if not tool_calls:
                return {
                    "recommendation": (msg.content or "").strip(),
                    "turns_used": turn,
                }

            # -- follow-up: run the requested read-only tools --------------
            messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": c.id,
                        "type": "function",
                        "function": {
                            "name": c.function.name,
                            "arguments": c.function.arguments or "{}",
                        },
                    }
                    for c in tool_calls
                ],
            })
            for c in tool_calls:
                try:
                    args = json.loads(c.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {"__parse_error__": c.function.arguments or ""}
                if "__parse_error__" in args:
                    result = {"error": "invalid tool arguments JSON"}
                else:
                    try:
                        result = await _dispatch_tool(
                            gh, owner, repo, c.function.name, args
                        )
                    except Exception as exc:
                        return {
                            "error": (
                                f"tool {c.function.name} failed: "
                                f"{type(exc).__name__}: {exc}"
                            )[:1000],
                            "turn": turn,
                        }
                messages.append({
                    "role": "tool",
                    "tool_call_id": c.id,
                    "name": c.function.name,
                    "content": json.dumps(result, default=str)[:TOOL_RESULT_CHARS],
                })

    return {
        "error": (
            f"planner hit the turn cap ({PLANNER_MAX_TURNS} model calls) "
            "without concluding"
        ),
        "turns_used": PLANNER_MAX_TURNS,
    }