"""Scorer for web extraction tasks.

Supports three answer types:
- Exact match (case-insensitive, trimmed)
- CONTAINS:text — predicted must contain the text
- RANGE:min-max — predicted must contain a number in range
- DYNAMIC_CHECK — always scores 1.0 if non-empty (for dynamic content)
"""


def score_webextract(question: str, ground_truth: str, predicted: str) -> float:
    """Score a web extraction answer.

    Args:
        question: The extraction question
        ground_truth: Expected answer (or pattern like CONTAINS:, RANGE:, DYNAMIC_CHECK)
        predicted: The agent's extracted answer

    Returns:
        1.0 for correct, 0.5 for partial, 0.0 for wrong
    """
    if not predicted or not predicted.strip():
        return 0.0

    predicted = predicted.strip()
    ground_truth = ground_truth.strip()

    # Dynamic content — just check non-empty extraction
    if ground_truth == "DYNAMIC_CHECK":
        return 1.0 if len(predicted) > 3 else 0.0

    # Contains check
    if ground_truth.startswith("CONTAINS:"):
        target = ground_truth[len("CONTAINS:"):].strip().lower()
        return 1.0 if target in predicted.lower() else 0.0

    # Range check
    if ground_truth.startswith("RANGE:"):
        range_str = ground_truth[len("RANGE:"):].strip()
        try:
            low, high = range_str.split("-")
            low, high = int(low), int(high)
            # Extract numbers from predicted
            import re
            numbers = re.findall(r'\d+', predicted)
            if numbers:
                val = int(numbers[0])
                return 1.0 if low <= val <= high else 0.0
        except (ValueError, IndexError):
            pass
        return 0.0

    # Exact match (case-insensitive, normalized whitespace)
    gt_norm = " ".join(ground_truth.lower().split())
    pred_norm = " ".join(predicted.lower().split())

    if gt_norm == pred_norm:
        return 1.0

    # Partial match — ground truth is contained in predicted
    if gt_norm in pred_norm:
        return 0.8

    # Predicted is contained in ground truth
    if pred_norm in gt_norm:
        return 0.5

    return 0.0
