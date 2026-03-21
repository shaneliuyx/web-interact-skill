"""Shared task registration for webextract evaluation.

Note: Callers must add the EvoSkill project root to sys.path before importing.
"""
from src.api import TaskConfig, register_task
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
