# EvoSkill Integration for web-interact

This directory contains custom task files for integrating the web-interact skill with [EvoSkill](https://github.com/sentient-agi/EvoSkill), a framework for evolutionary self-improvement of Claude Code skills.

## What is EvoSkill?

EvoSkill runs an iterative loop where:
1. An agent attempts benchmark tasks using the current skill
2. Failures are sampled and analyzed by a Proposer
3. The Proposer generates improved skill variants
4. Variants are scored on a validation set
5. Top-performing variants survive to the next iteration

Over several iterations, the skill converges toward higher accuracy.

## Files

| File | Purpose |
|------|---------|
| `webextract_benchmark.csv` | 20-question benchmark dataset |
| `webextract_agent/webextract_agent.py` | Agent factory using the web-interact skill |
| `webextract_agent/prompt.txt` | Agent system prompt (evolved by EvoSkill) |
| `webextract_agent/__init__.py` | Module exports |
| `webextract_scorer.py` | Custom scorer with CONTAINS/RANGE/DYNAMIC_CHECK support |
| `run_loop_webextract.py` | Run the evolutionary improvement loop |
| `run_eval_webextract.py` | Run standalone evaluation (no evolution) |

## Setup

```bash
# 1. Clone EvoSkill
git clone https://github.com/sentient-agi/EvoSkill /tmp/EvoSkill
cd /tmp/EvoSkill
uv sync

# 2. Copy these custom files into EvoSkill
cp -r ~/Documents/web-interact-skill/evoskill/webextract_agent/ src/agent_profiles/
cp ~/Documents/web-interact-skill/evoskill/webextract_scorer.py src/evaluation/
cp ~/Documents/web-interact-skill/evoskill/webextract_benchmark.csv .dataset/
cp ~/Documents/web-interact-skill/evoskill/run_loop_webextract.py scripts/
cp ~/Documents/web-interact-skill/evoskill/run_eval_webextract.py scripts/

# 3. Set your API key
export ANTHROPIC_API_KEY=sk-ant-...
```

## Running

### Standalone evaluation (no evolution)

Tests the current skill against all 20 benchmark questions:

```bash
# IMPORTANT: unset CLAUDECODE before running — EvoSkill spawns its own Claude agents
unset CLAUDECODE
cd /tmp/EvoSkill
uv run python scripts/run_eval_webextract.py --model sonnet --max-concurrent 2
```

### Evolutionary improvement loop

Runs N iterations of propose → evaluate → select:

```bash
unset CLAUDECODE
cd /tmp/EvoSkill
uv run python scripts/run_loop_webextract.py \
  --mode skill_only \
  --max-iterations 5 \
  --model sonnet \
  --concurrency 2 \
  --frontier-size 3
```

Options:
- `--mode skill_only` — evolve the SKILL.md content (recommended)
- `--mode prompt_only` — evolve the agent system prompt instead
- `--max-iterations N` — number of evolution rounds (5-10 typical)
- `--concurrency N` — parallel agent runs (keep low: 2 for browser tasks)
- `--frontier-size N` — top N variants to keep each round
- `--continue` — resume from a previous run's frontier

## Benchmark Dataset

The dataset (`webextract_benchmark.csv`) contains 20 questions in 3 categories:

| Category | Count | Examples |
|----------|-------|---------|
| static | 10 | Page titles, headings, meta descriptions from stable pages |
| dynamic | 6 | Live content (HN headlines, counts) — scored as DYNAMIC_CHECK |
| metadata | 4 | Open Graph tags, structured data |

### Scorer patterns

| Pattern | Example ground truth | Scoring |
|---------|---------------------|---------|
| Exact match | `Example Domain` | 1.0 if matches, 0.0 otherwise |
| CONTAINS: | `CONTAINS:Wikipedia` | 1.0 if predicted contains text |
| RANGE: | `RANGE:25-35` | 1.0 if extracted number is in range |
| DYNAMIC_CHECK | `DYNAMIC_CHECK` | 1.0 if non-empty (>3 chars) |

## Important Notes

- **Must `unset CLAUDECODE`** before running — EvoSkill uses `claude --dangerously-skip-permissions` internally, which conflicts with an active Claude Code session
- Browser-based tasks are slow — keep `--concurrency` at 2 or lower
- Results are saved to `/tmp/EvoSkill/results/` between iterations
- The evolved `prompt.txt` can be copied back to `~/.claude/skills/web-interact/` or used as the new baseline
