"""Worker entrypoint: registers the decision workflow and polls for tasks."""

import asyncio

import mistralai.workflows as workflows

from cloud_decision.workflows.decision import DecisionWorkflow


async def main() -> None:
    await workflows.run_worker([DecisionWorkflow])


if __name__ == "__main__":
    asyncio.run(main())
