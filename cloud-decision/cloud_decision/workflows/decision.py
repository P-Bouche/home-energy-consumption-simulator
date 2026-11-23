"""The decision-only workflow and its durable planner agent.

Sandbox rules: this module runs inside the workflow sandbox, so it must not
import anything with side effects (httpx, network). The GitHub activities
live in `cloud_decision.activities` and are imported under
`workflow.unsafe.imports_passed_through()`, the documented escape hatch.
Imports are absolute (not relative): the sandbox re-imports workflow modules
without their package context.
"""

from __future__ import annotations

import mistralai.workflows as workflows
from mistralai.workflows import workflow
import mistralai.workflows.plugins.mistralai as workflows_mistralai
from mistralai.client.models import TextChunk

from cloud_decision.github import (
    PLANNER_INSTRUCTIONS,
    normalize_direct_input,
    target_from_webhook,
)

with workflow.unsafe.imports_passed_through():
    from cloud_decision.activities import (
        fetch_issue,
        list_repo_dir,
        post_issue_comment,
        read_repo_file,
    )

MAX_TURNS = 40


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
            f"Issue #{issue_number} ({issue['title']}):

{issue['body']}

"
            "Analyze feasibility and give your recommendation."
        )
        outputs = await workflows_mistralai.Runner.run(
            agent=agent, inputs=inputs,
            # LocalSession: the agent loop runs in the worker via the direct
            # chat completions API. RemoteSession needs POST /v1/agents, which
            # is disabled for this org (403, code 3000).
            session=workflows_mistralai.LocalSession(),
            max_turns=MAX_TURNS,
        )
        recommendation = "
".join(
            o.text for o in outputs if isinstance(o, TextChunk)
        ).strip()

        # -- Deliver: comment on the issue when a token is bound ------------
        posted = {"posted": False, "reason": "empty recommendation"}
        if recommendation:
            comment = (
                f"**Decision-only analysis (cloud-decision workflow)**

"
                f"{recommendation}

"
                "---
Automated hosted planner ( mistral-large-latest)."
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
