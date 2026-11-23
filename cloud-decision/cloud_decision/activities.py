"""GitHub REST activities. Never imported inside the workflow sandbox directly.

This module performs network I/O (httpx) and is therefore imported from the
workflow module under `workflow.unsafe.imports_passed_through()` only.
"""

from __future__ import annotations

import os

import httpx

import mistralai.workflows as workflows

from ..github import decode_contents_entry

GITHUB_API = "https://api.github.com"
MAX_FILE_CHARS = 60_000


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


@workflows.activity()
async def read_file_for(owner: str, repo: str, path: str) -> dict:
    """Read a repository file on the main branch (curried for one repo).

    Args:
        owner: repository owner
        repo: repository name
        path: file path in the repository
    """
    return await read_repo_file(path=path, owner=owner, repo=repo, ref="main")


@workflows.activity()
async def list_dir_for(owner: str, repo: str, path: str) -> dict:
    """List a repository directory on the main branch (curried for one repo).

    Args:
        owner: repository owner
        repo: repository name
        path: directory path, "" for the repository root
    """
    return await list_repo_dir(path=path, owner=owner, repo=repo, ref="main")
