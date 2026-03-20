#!/usr/bin/env python3
"""Run the EvoSkill self-improvement loop for web extraction tasks.

Usage:
    uv run python scripts/run_loop_webextract.py --mode skill_only --max-iterations 5
    uv run python scripts/run_loop_webextract.py --mode skill_only --max-iterations 10 --model sonnet
"""

import asyncio
import argparse
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.api import EvoSkill, TaskConfig, register_task
from src.agent_profiles.webextract_agent import make_webextract_agent_options
from src.evaluation.webextract_scorer import score_webextract


def _webextract_scorer_wrapper(question: str, predicted: str, ground_truth: str) -> float:
    """Wrapper matching EvoSkill's (question, predicted, ground_truth) signature."""
    return score_webextract(question, ground_truth, predicted)


def register_webextract_task():
    """Register the web extraction task."""
    register_task(TaskConfig(
        name="webextract",
        make_agent_options=make_webextract_agent_options,
        scorer=_webextract_scorer_wrapper,
        question_col="question",
        answer_col="ground_truth",
        category_col="category",
        default_dataset=".dataset/webextract_benchmark.csv",
    ))


async def main():
    parser = argparse.ArgumentParser(description="EvoSkill Web Extraction Loop")
    parser.add_argument("--mode", default="skill_only", choices=["skill_only", "prompt_only"],
                        help="Evolution mode")
    parser.add_argument("--max-iterations", type=int, default=5,
                        help="Maximum improvement iterations")
    parser.add_argument("--frontier-size", type=int, default=3,
                        help="Number of top programs to retain")
    parser.add_argument("--concurrency", type=int, default=2,
                        help="Concurrent evaluations (low for browser-based tasks)")
    parser.add_argument("--model", default="sonnet",
                        help="Base agent model")
    parser.add_argument("--continue", dest="continue_mode", action="store_true",
                        help="Resume from existing frontier")
    parser.add_argument("--failure-samples", type=int, default=3,
                        help="Number of failure samples per iteration")
    args = parser.parse_args()

    # Register our custom task
    register_webextract_task()

    print("=" * 60)
    print("EvoSkill — Web Extraction Skill Refinement")
    print("=" * 60)
    print(f"Mode: {args.mode}")
    print(f"Model: {args.model}")
    print(f"Max iterations: {args.max_iterations}")
    print(f"Concurrency: {args.concurrency}")
    print()

    evo = EvoSkill(
        task="webextract",
        model=args.model,
        mode=args.mode,
        max_iterations=args.max_iterations,
        frontier_size=args.frontier_size,
        concurrency=args.concurrency,
        continue_mode=args.continue_mode,
        failure_samples=args.failure_samples,
        train_ratio=0.4,   # 40% for training/failure analysis
        val_ratio=0.3,     # 30% for validation scoring
    )

    # Preview dataset
    info = evo.dataset_info
    print(f"Dataset: {info['dataset']}")
    print(f"Total samples: {info['total_rows']}")
    print(f"Categories: {info['categories']}")
    print()

    result = await evo.run()

    print()
    print("=" * 60)
    print("RESULTS")
    print("=" * 60)
    print(f"Best program: {result.best_program}")
    print(f"Best score: {result.best_score:.1%}")
    print(f"Frontier: {result.frontier}")
    print(f"Iterations: {result.iterations_completed}")


if __name__ == "__main__":
    asyncio.run(main())
