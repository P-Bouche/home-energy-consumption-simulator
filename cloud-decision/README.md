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

Direct manual input is also accepted for a one-off analysis:

```json
{"owner": "P-Bouche", "repo": "home-energy-consumption-simulator", "issue_number": 47}
```

## Repository layout

- `cloud_decision/workflows/decision.py` — workflow entrypoint, fail-fast wrappers
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
   signing secret, trigger bound to workflow identifier `decision-request`,
   then on GitHub side add a repository webhook (events: `issues`) with the
   same secret pointing at the Studio webhook URL.

## Verification

- `python -m py_compile` on all modules; AST check: 5 activities, 1 workflow.
- Payload parsing: 6 unit tests, all passing (SDK-free, run with plain
  python; see `tests/test_github_payload.py`).
- End-to-end verified on issue #47: analysis + comment posted in ~34 s,
  planner reading the upstream Open3CL engine through its cross-repo tool.

## Cost shape

One analysis = issue fetch (REST, free) + a bounded planner run capped at
10 model calls of 90 s on `mistral-large-latest` (PAYG); observed complete
runs use ~10 model calls and finish in well under a minute. Ignored events
cost nothing: the workflow exits before any model call.
