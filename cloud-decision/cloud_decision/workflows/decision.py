"""The decision-only workflow; the planner loop lives in an activity.

Sandbox rules: this module runs inside the workflow sandbox, so it must not
import anything with side effects (httpx, network). The GitHub activities
live in "cloud_decision.activities" and are imported under
"workflow.unsafe.imports_passed_through()", the documented escape hatch.
Imports are absolute (not relative): the sandbox re-imports workflow modules
without their package context.

v3 (bounded): the planner agent loop no longer runs here through the durable
agent (Runner.run + LocalSession), which hung the workflow inside a single
model call. It is delegated to the "run_planner" activity, which enforces
a turn cap, per-call timeouts and fail-fast error handling.

v4 (trigger envelope): Mistral triggers pass the whole HTTP request as the
workflow input ("nothing is mapped or templated"): {method, path, headers,
query_params, body, raw_body}. The registered input schema is built from the
entrypoint signature with additionalProperties=false, so the entrypoint must
declare those envelope fields as parameters. A single 'payload' parameter
rejected the envelope at the root and every trigger launch failed with a
permanent execution_error (4xx, no execution record). 'payload' is kept for
direct manual runs and legacy envelope-shaped inputs.
"""

from __future__ import annotations

import mistralai.workflows as workflows
from mistralai.workflows import workflow

from cloud_decision.github import (
    PLANNER_INSTRUCTIONS,
    normalize_direct_input,
    target_from_webhook,
)

with workflow.unsafe.imports_passed_through():
    from cloud_decision.activities import (
        fetch_issue,
        post_issue_comment,
        run_planner,
    )


@workflows.workflow.define(name="decision-request")
class DecisionWorkflow:
    @workflows.workflow.entrypoint
    async def run(
        self,
        payload: dict | None = None,
        method: str | None = None,
        path: str | None = None,
        headers: dict | None = None,
        query_params: dict | None = None,
        body: dict | None = None,
        raw_body: str | None = None,
    ) -> dict:
        # -- Resolve the target: trigger envelope, webhook payload or
        # direct manual input ----------------------------------------------
        target = None
        if body is not None or method is not None:
            # Trigger path: the input is the whole HTTP request.
            event = {
                "method": method or "POST",
                "path": path or "/",
                "headers": headers or {},
                "query_params": query_params or {},
                "body": body,
                "raw_body": raw_body or "",
            }
            target = target_from_webhook(event)
        elif payload is not None:
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

        # -- Gather the issue (fail fast, no infinite Temporal retry) -------
        try:
            issue = await fetch_issue(
                owner=owner, repo=repo, issue_number=issue_number
            )
        except Exception as exc:
            return {
                "status": "error",
                "stage": "fetch_issue",
                "issue_number": issue_number,
                "error": f"{type(exc).__name__}: {exc}"[:1000],
            }

        # -- Run the bounded planner agent loop (activity) ------------------
        try:
            outcome = await run_planner(
                owner=owner,
                repo=repo,
                issue_number=issue_number,
                title=issue["title"],
                body=issue["body"],
                instructions=PLANNER_INSTRUCTIONS,
            )
        except Exception as exc:
            return {
                "status": "error",
                "stage": "run_planner",
                "issue": issue["html_url"],
                "error": f"{type(exc).__name__}: {exc}"[:1000],
            }

        recommendation = (outcome.get("recommendation") or "").strip()
        if not recommendation:
            # run_planner reports errors in the result instead of raising.
            return {
                "status": "error",
                "stage": "planner",
                "issue": issue["html_url"],
                "error": outcome.get("error") or "empty recommendation",
                "turn": outcome.get("turn") or outcome.get("turns_used"),
            }

        # -- Deliver: comment on the issue when a token is bound ------------
        posted = {"posted": False, "reason": "unreachable"}
        try:
            posted = await post_issue_comment(
                owner=owner, repo=repo, issue_number=issue_number,
                body=(
                    "**Decision-only analysis (cloud-decision workflow)**\n\n"
                    + recommendation + "\n\n"
                    + "---\nAutomated hosted planner"
                    " (mistral-large-latest). No file was modified."
                ),
            )
        except Exception as exc:
            posted = {
                "posted": False,
                "reason": f"{type(exc).__name__}: {exc}"[:1000],
            }

        return {
            "status": "analyzed",
            "issue": issue["html_url"],
            "comment_posted": bool(posted.get("posted")),
            "not_posted_reason": posted.get("reason"),
            "turns_used": outcome.get("turns_used"),
            "recommendation": recommendation[:8000],
        }
