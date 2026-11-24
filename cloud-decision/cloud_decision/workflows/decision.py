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

v4 -> v5 (trigger input): a Mistral trigger hands the workflow the webhook
request as a TriggerEvent (mistralai-workflows-plugins-triggers package):
{method, headers, query_params, body, raw_body}. The API validates trigger
inputs against the registered input schema BEFORE starting the workflow,
and a mismatch is a permanent failure with no execution to inspect
(TRIGGER_FAILED / execution_error). Entrypoint kwargs generate a schema with
additionalProperties=false, which rejects the trigger envelope (extra root
keys the API may add). The typed TriggerEvent parameter registers the
permissive schema (extra ignored) designed for exactly this path, so v5
uses a single 'event' parameter. Manual runs pass the same envelope in
'event.body'; direct input passes {owner, repo, issue_number} in 'event.body'.
"""

from __future__ import annotations

import mistralai.workflows as workflows
from mistralai.workflows import workflow

with workflow.unsafe.imports_passed_through():
    from mistralai.workflows.plugins.triggers import TriggerEvent

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
    async def run(self, event: TriggerEvent | None = None) -> dict:
        # -- Resolve the target: trigger envelope or direct manual input ---
        if event is None:
            return {"status": "ignored", "reason": "no input"}
        # The sandbox re-serializes inputs; accept the model or a plain dict.
        data = (
            event.model_dump() if hasattr(event, "model_dump") else dict(event)
        )
        target = None
        body = data.get("body")
        if isinstance(body, dict):
            # Trigger path: body is the GitHub event payload.
            target = target_from_webhook(data)
            if target is None and "owner" in body:
                # Manual path: direct {owner, repo, issue_number} input.
                target = normalize_direct_input(
                    body.get("owner", ""), body.get("repo", ""),
                    body.get("issue_number", 0) or 0,
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
