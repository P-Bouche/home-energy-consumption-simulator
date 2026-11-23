"""The decision-only workflow, its activities, and its durable planner agent."""

from __future__ import annotations

import os
from typing import Any

import httpx
import mistralai.workflows as workflows
import mistralai.workflows.plugins.mistralai as workflows_mistralai
from mistralai.client.models import TextChunk

from .github import (
    PLANNER_INSTRUCTIONS,
    decode_contents_entry,
    normalize_direct_input,
    target_from_webhook,
)

GITHUB_API = "https://api.github.com"
MAX_FILE_CHARS = 60_000
MAX_TURNS = 40

# Port of the kit's decision-only discipline, adapted to hosted execution.


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


@workflows.activity()
async def list_repo_dir(path: str, owner: str, repo: str, ref: str = "main") -> dict:
    """List a directory of the repository.

    Args:
        path: directory path in the repository ("" for the root)
        owner: repository owner
        repo: repository name
        ref: branch, tag or commit (default main)
    """
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contents" + (f"/{path}" if path else "")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            url, params={"ref": ref}, headers=_gh_headers(_github_token())
        )
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


def _build_planner(target: dict) -> workflows_mistralai.Agent:
    owner, repo = target["owner"], target["repo"]

    async def read_file(path: str) -> dict:
        """Read a repository file (main branch).

        Args:
            path: file path in the repository
        """
        return await read_repo_file(path=path, owner=owner, repo=repo, ref="main")

    async def list_dir(path: str) -> dict:
        """List a repository directory (main branch).

        Args:
            path: directory path, "" for the repository root
        """
        return await list_repo_dir(path=path, owner=owner, repo=repo, ref="main")

    return workflows_mistralai.Agent(
        # Per-role model mapping decided 2026-11-23: planner = Mistral Large 4.
        model="mistral-large-latest",
        name="cloud-planner",
        description="Decision-only planner for the DPE simulator repo.",
        instructions=PLANNER_INSTRUCTIONS,
        tools=[read_file, list_dir],
    )


@workflows.workflow.define(name="decision-request")
class DecisionWorkflow:
    @workflows.workflow.entrypoint
    async def run(self, payload: dict | None = None) -> dict:
        # -- Resolve the target: webhook payload or direct manual input ------
        if payload is None:
            return {"status": "ignored", "reason": "no input"}
        target = target_from_webhook(payload)
        if target is None and "owner" in payload:
            target = normalize_direct_input(
                payload.get("owner", ""), payload.get("repo", ""),
                payload.get("issue_number", 0) or 0,
            )
        if target is None:
            return {"status": "ignored"}

        owner = target["owner"]
        repo = target["repo"]
        issue_number = target["issue_number"]

        # -- Gather the issue (activity), then run the durable planner ------
        issue = await fetch_issue(owner=owner, repo=repo, issue_number=issue_number)
        agent = _build_planner(target)
        inputs = (
            f"Issue #{issue_number} ({issue['title']}):\n\n{issue['body']}\n\n"
            "Analyze feasibility and give your recommendation."
        )
        outputs = await workflows_mistralai.Runner.run(
            agent=agent, inputs=inputs,
            session=workflows_mistralai.RemoteSession(),
            max_turns=MAX_TURNS,
        )
        recommendation = "\n".join(
            o.text for o in outputs if isinstance(o, TextChunk)
        ).strip()

        # -- Deliver: comment on the issue when a token is bound ------------
        posted = {"posted": False, "reason": "empty recommendation"}
        if recommendation:
            comment = (
                f"**Decision-only analysis (cloud-decision workflow)**\n\n"
                f"{recommendation}\n\n"
                "---\nAutomated hosted planner ( mistral-large-latest)."
                " No file was modified."
            )
            posted = await post_issue_comment(
                owner=owner, repo=repo, issue_number=issue_number, body=comment
            )

        return {
            "status": "analyzed",
            "issue": issue["html_url"],
            "comment_posted": bool(posted.get("posted")),
            "not_posted_reason": posted.get("reason"),
            "recommendation": recommendation[:8000],
        }
