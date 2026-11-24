# cloud-decision: decision-only planner hosted on Mistral

Hosted counterpart of the `harness-poc` decision-only runs: when an issue gets
the `decision-request` label on GitHub, a Mistral Workflows managed deployment
analyzes it and posts its recommendation as a comment on the issue. No file is
ever modified; the human gate stays with the maintainer.

## Flow

1. GitHub sends an `issues` webhook to the Studio webhook URL (secret-signed).
2. The trigger maps the webhook to the `decision-request` workflow.
3. The workflow parses the payload (label `decision-request` present, event
   `labeled` adding it — see `target_from_webhook`), fetches the issue, and
   runs a **bounded planner loop** in the `run_planner` activity
   (`mistral-large-latest` via `get_mistral_client()`, port of the kit's
   planner instructions). Read-only tools: `read_file` / `list_dir` via the
   GitHub REST API, on the issue's repository or any public repository
   (`{"repo": "owner/name"}`), plus `search_npm`, `search_github` and
   `fetch_url` (public https, text/json only) to verify external libraries
   at the source instead of guessing.

   Hard bounds: **10 model calls max, 90 s per call**, final turn forced to
   conclude without tools. Any error (timeout, API, tool) stops the run and
   is returned as `{"status": "error", ...}` — no infinite retry: the loop
   lives in an activity, outside the workflow sandbox (the in-sandbox
   durable agent hung the workflow inside a single model call).
4. The recommendation is posted as a comment on the issue when the
   `GITHUB_TOKEN` secret is bound; otherwise it stays in the execution result
   (readable in Studio) and the result says so.

Direct manual input is also accepted for a one-off analysis (same envelope
the trigger sends, as an `event` — see the gotcha below):

```json
{"event": {"method": "POST", "headers": {}, "query_params": {},
           "body": {"owner": "P-Bouche",
                    "repo": "home-energy-consumption-simulator",
                    "issue_number": 48}}}
```

## Trigger input contract (gotcha: `TriggerEvent`)

The entrypoint takes a single typed parameter: `run(self,
event: TriggerEvent | None)` from the `mistralai-workflows-plugins-triggers`
package (added to `pyproject.toml`). This is not cosmetic:

- When a trigger fires, the Workflows API hands the workflow the webhook
  request wrapped as a **TriggerEvent**: `{method, headers, query_params,
  body, raw_body}` (credential headers stripped). `body` is the GitHub
  event payload.
- The API **validates this input against the registered input schema
  before starting the workflow.** A mismatch is a permanent failure with
  no execution to inspect: the trigger event shows `TRIGGER_FAILED` /
  `execution_error`, retries never happen, and `list_executions` stays
  empty. This exact symptom cost a morning of debugging.
- Entrypoint **kwargs** (e.g. `run(self, payload: dict)` or even
  `run(self, method: str, headers: dict, ...)`) generate a schema with
  `additionalProperties: false` at the root, which rejects the envelope’s
  root keys — and any root field the API may add later.
- The triggers plugin exists precisely for this: a parameter typed as
  `TriggerEvent` (or a provider subtype like `github.Event`) registers the
  **permissive schema** (`extra="ignore"`) that the API expects on the
  trigger path. Do not type the entrypoint with bare dicts if the workflow
  is ever started by a trigger.

Diagnostics used: `GET /v1/triggers/{trigger_id}/events` (`status` +
`detail` per event; an empty list means the payload never passed ingest) and
`mistral_mcp.list_workflow_registrations` (`include_definition: true` shows
the effective input schema).

## Repository layout

- `cloud_decision/workflows/decision.py` — workflow entrypoint (single
  `event: TriggerEvent` parameter), fail-fast wrappers
- `cloud_decision/activities.py` — GitHub REST activities + the bounded planner loop
- `cloud_decision/github.py` — pure helpers (webhook parsing, content decoding, planner instructions)
- `cloud_decision/worker.py` — worker entrypoint (`run_worker([DecisionWorkflow])`)
- `tests/test_github_payload.py` — payload parsing tests (SDK-free)
- `deploy/docker/Dockerfile.worker` — managed-deployment image

## Deploy (one-time, requires the organization's pay-as-you-go)

1. **Enable pay-as-you-go** on the Mistral organization (managed deployments
   do not run on Free/Pro/Team plans without it).
2. **Install the Mistral GitHub App** on this repository
   (github.com/apps/mistralai) and connect GitHub in Studio's GitHub App
   settings.
3. **Create a PAT** with `repo` scope (public_repo is not enough to comment)
   and store it in Studio's Secrets Manager as `GITHUB_TOKEN`
   (secret reference: `secret:workspace:github_token`).
4. **Create the deployment** (Console or API):

```python
deployment = client.workflows.deployments.create_deployment(
    name="cloud-decision",
    spec={
        "github_url": "https://github.com/P-Bouche/home-energy-consumption-simulator",
        "revision": "main",
        "backend_spec": {
            "type": "mistral_cloud",
            "dockerfile_path": "cloud-decision/deploy/docker/Dockerfile.worker",
            "build_directory": "cloud-decision",
        },
    },
)
```

5. **Create the webhook + trigger**: webhook `provider: "github"` with a
   signing secret, trigger bound to workflow identifier `decision-request`
   (the workflow **name**, not its ID), then on GitHub side add a repository
   webhook (events: `issues`) with the same secret pointing at the Studio
   webhook URL. Note: the signing secret cannot be changed after creation —
   rotating it means recreating the webhook and its triggers. And keep
   exactly one active deployment serving the workflow, or trigger launches
   fail.

## Verification

- `python -m py_compile` on all modules; AST check: 5 activities, 1 workflow.
- Payload parsing: 9 unit tests, all passing (SDK-free, run with plain
  python; see `tests/test_github_payload.py`).
- End-to-end verified on issue #47 by direct execution: analysis + comment
  in ~34 s, planner reading the upstream Open3CL engine through its
  cross-repo tool.
- End-to-end verified **through the trigger** on issue #48: label
  `decision-request` re-added → workflow started automatically (the
  `unlabeled` delivery was ignored in 1.7 s), planner bounded at 10 turns,
  comment posted on the issue, run completed in 78 s.

## Cost shape

One analysis = issue fetch (REST, free) + a bounded planner run capped at
10 model calls of 90 s on `mistral-large-latest` (PAYG); observed complete
runs use ~10 model calls and finish in well under two minutes. Ignored
events cost nothing: the workflow exits before any model call.
