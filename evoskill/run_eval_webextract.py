#!/usr/bin/env python3
"""Run standalone evaluation for web extraction tasks.

Usage:
    uv run python scripts/run_eval_webextract.py --model sonnet --max-concurrent 2
"""

import asyncio
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.api import EvalRunner
from evoskill.webextract_task import register_webextract_task


async def main():
    parser = argparse.ArgumentParser(description="Evaluate Web Extraction Agent")
    parser.add_argument("--model", default="sonnet", help="Model to use")
    parser.add_argument("--max-concurrent", type=int, default=2,
                        help="Max concurrent evaluations")
    parser.add_argument("--num-samples", type=int, default=None,
                        help="Limit number of samples to evaluate")
    parser.add_argument("--output", default=None, help="Output path for results")
    args = parser.parse_args()

    register_webextract_task()

    print("=" * 60)
    print("Web Extraction Agent — Evaluation")
    print("=" * 60)

    runner = EvalRunner(
        task="webextract",
        model=args.model,
        max_concurrent=args.max_concurrent,
    )

    summary = await runner.run()

    print()
    print(f"Accuracy: {summary.accuracy:.1%} ({summary.correct}/{summary.successful})")
    print(f"Failed runs: {summary.failed}")


if __name__ == "__main__":
    asyncio.run(main())
