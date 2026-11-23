"""Hosted decision-only planner for the DPE simulator repo (Mistral Workflows).

Deployed as a managed deployment; triggered by a GitHub webhook when an issue
is labeled `decision-request`, or run manually with a direct input. Reads the
issue and the repo files via the public GitHub REST API, produces a decision
recommendation with a durable agent, and posts it as a comment on the issue.
"""

__version__ = "0.1.0"
