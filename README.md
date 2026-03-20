# web-interact

Unified web page interaction skill for Claude Code. Automatically extracts content from web pages when WebFetch fails or returns empty/blocked content.

## Features

- **Fast-path extraction**: curl-first strategy skips browser for static pages (1.5s vs 5s)
- **Three automation layers**: agent-browser (headless Playwright) → chrome-cdp (existing Chrome) → ghost-os (desktop GUI)
- **Automatic fallback chain**: SSL errors, WAF detection, timeouts all handled with strategy switching
- **SPA support**: Waits for JavaScript hydration on React/Vue/Next.js pages
- **Security hardened**: URL validation prevents command injection, TLS skip only as last resort
- **Helper script**: `extract.mjs` — one-command extraction with automatic fallback

## Quick Install

```bash
git clone <repo-url> ~/Documents/web-interact-skill
cd ~/Documents/web-interact-skill
bash install.sh
```

## Prerequisites

| Tool | Required | Install |
|------|----------|---------|
| agent-browser | Yes | `npm i -g agent-browser` |
| ghost-os | Optional | `brew install ghost-os` |
| chrome-cdp | Optional | Already included if you have the chrome-cdp skill |
| Node.js 18+ | Yes | `brew install node` |

## How It Works

### Strategy: Fast-Path First, Escalate on Failure

1. **curl fast-path** (1-2s) — works for static content, APIs, server-rendered HTML
2. **agent-browser** (5-15s) — JavaScript rendering, SPAs, form interaction
3. **chrome-cdp** (instant) — uses your real Chrome session (logged-in sites)
4. **ghost-os** (varies) — desktop apps, visual grounding, CAPTCHA solving

### Decision Tree

```
Is it read-only content extraction?
  → Try curl/WebFetch first (fastest)
  → If empty/blocked → agent-browser

Is it a JavaScript-rendered SPA?
  → agent-browser with wait --load load + delay

Need an existing login session?
  → chrome-cdp (connects to your real Chrome)

Need desktop/visual interaction?
  → ghost-os MCP tools
```

## Usage

### As a Claude Code skill

The skill auto-triggers when you ask to "scrape a page", "get info from website", "extract data from site", etc.

```
You: Get the top headlines from Hacker News
Claude: [uses web-interact skill automatically]
```

Or invoke directly: `/web-interact`

### Helper script

```bash
# Extract main content from any URL
node ~/.claude/skills/web-interact/scripts/extract.mjs https://example.com

# Extract specific CSS selector
node ~/.claude/skills/web-interact/scripts/extract.mjs https://news.ycombinator.com ".titleline a"
```

### agent-browser workflow

```bash
agent-browser open https://example.com
agent-browser wait --load load
agent-browser wait 2000
agent-browser snapshot -i           # get @e1, @e2 refs
agent-browser eval "document.title"
agent-browser click @e3
agent-browser close
```

### chrome-cdp workflow

```bash
CDP=~/.claude/skills/chrome-cdp/scripts/cdp.mjs
$CDP list                            # find target ID
$CDP snap <target>                   # accessibility tree
$CDP eval <target> "document.title"  # run JS
$CDP html <target> ".content"        # extract by CSS selector
$CDP click <target> "button.submit"  # click by CSS selector
```

## Error Recovery

| Error | Cause | Auto-fix |
|-------|-------|----------|
| SSL cert error | Invalid certificate | Retries curl with `-k` as last resort (with warning) |
| Access Denied / 403 | WAF/bot detection | Switch to chrome-cdp |
| Timeout on wait | Heavy site | `load` + delay (never networkidle) |
| Empty body | SPA not hydrated | `wait --fn` for element |
| CAPTCHA | Bot protection | chrome-cdp or ghost-os |

## Performance

| Site Type | Method | Time |
|-----------|--------|------|
| Static (example.com) | curl fast-path | 1.5s |
| Server-rendered (GitHub) | curl fast-path | 2.4s |
| JS-rendered (HN) | agent-browser | ~5s |
| CSS selector needed | browser fallback | ~7s |

## EvoSkill Integration (Optional)

This repo includes an [EvoSkill](https://github.com/sentient-agi/EvoSkill) integration for automated skill refinement through evolutionary optimization.

### Setup

```bash
# Clone EvoSkill
git clone https://github.com/sentient-agi/EvoSkill /tmp/EvoSkill
cd /tmp/EvoSkill && uv sync

# Copy our custom task files
cp -r ~/Documents/web-interact-skill/evoskill/webextract_agent/ src/agent_profiles/
cp ~/Documents/web-interact-skill/evoskill/webextract_scorer.py src/evaluation/
cp ~/Documents/web-interact-skill/evoskill/webextract_benchmark.csv .dataset/
cp ~/Documents/web-interact-skill/evoskill/run_loop_webextract.py scripts/
cp ~/Documents/web-interact-skill/evoskill/run_eval_webextract.py scripts/
```

### Run the evolutionary loop

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# IMPORTANT: Run outside Claude Code session
unset CLAUDECODE
uv run python scripts/run_loop_webextract.py --mode skill_only --max-iterations 5 --model sonnet
```

### How it works

1. Agents attempt web extraction benchmark questions
2. Failures are analyzed by the proposer
3. New/improved skills are generated
4. Variants are scored against validation set
5. Top performers survive to next iteration

### Benchmark dataset

20 questions across 3 categories: static (10), dynamic (6), metadata (4).
Custom scorer supports exact match, CONTAINS:, RANGE:, and DYNAMIC_CHECK patterns.

## Security

- **URL validation**: All URLs are parsed via `new URL()` and must be `http:` or `https:` — prevents command injection via shell metacharacters
- **No shell interpolation**: `extract.mjs` uses `spawnSync` with argument arrays instead of string interpolation for curl and agent-browser commands
- **TLS verification on by default**: `curl -k` is NOT used by default — only as a last-resort fallback after both normal curl and browser extraction fail, with a stderr warning
- **Selector sanitization**: CSS selectors are escaped via `JSON.stringify` before being eval'd in browser context
- **Credential safety**: ghost-os auth flows warn against hardcoding passwords in conversation context

## Skill Files

| File | Purpose |
|------|---------|
| `skill/SKILL.md` | Main instructions (loaded by Claude Code) |
| `skill/REFERENCE.md` | Advanced patterns, auth, cookies, network |
| `skill/scripts/extract.mjs` | One-command extraction with curl→browser→curl-k fallback |

## License

MIT
