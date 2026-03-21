# web-interact

Unified web page interaction skill for Claude Code. Automatically extracts content from web pages when WebFetch fails or returns empty/blocked content.

## Features

- **Fast-path extraction**: curl-first strategy skips browser for static pages (1.5s vs 5s)
- **Four automation layers**: agent-browser (headless Playwright) → browser-use (autonomous AI) → chrome-cdp (existing Chrome) → ghost-os (desktop GUI)
- **Automatic fallback chain**: SSL errors, WAF detection, timeouts all handled with strategy switching
- **SPA support**: Waits for JavaScript hydration on React/Vue/Next.js pages
- **Security hardened**: URL validation prevents command injection, TLS skip only as last resort
- **Helper script**: `extract.mjs` — one-command extraction with automatic fallback
- **35 diverse test cases**: static HTML, JSON APIs, XML, redirects, selectors, UTF-8, Wikipedia, GitHub, HN, StackOverflow, MDN, arxiv, and more
- **Chrome CDP with inline WebSocket eval**: `cdp-eval.mjs` uses Node 22 built-in WebSocket for zero-dependency CDP evaluation

## Installation

### Step 1: Clone the repository

```bash
git clone https://github.com/shaneliuyx/web-interact-skill.git ~/Documents/web-interact-skill
cd ~/Documents/web-interact-skill
```

### Step 2: Install required dependencies

```bash
# Node.js 18+ (required for extract.mjs and agent-browser)
brew install node

# agent-browser — headless Playwright automation for Claude Code (required)
npm i -g agent-browser

# Install Playwright's Chromium headless shell (required by agent-browser)
# IMPORTANT: Use the same playwright-core version that agent-browser depends on.
# Check with: npm list playwright-core -g
# Then install matching browser:
npx playwright-core@$(npm list playwright-core -g --json 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print([v for k,v in d.get('dependencies',{}).items() if 'agent-browser' in k][0]['dependencies']['playwright-core']['version'])" 2>/dev/null || echo "latest") install chromium
```

### Step 3: Install optional dependencies

```bash
# browser-use — autonomous AI browser agent for multi-step tasks (optional, Tier 2.5)
uv tool install browser-use
browser-use install  # downloads its own Chromium

# Node.js 22+ — required for chrome-cdp tier (built-in WebSocket)
brew install node@22
# Verify: /opt/homebrew/opt/node@22/bin/node --version

# ghost-os — desktop GUI automation via MCP (optional, Tier 5)
# See: https://github.com/anthropics/ghost-os
```

### Step 4: Run the installer

```bash
bash install.sh
```

This copies skill files to `~/.claude/skills/web-interact/`:
- `SKILL.md` — main skill instructions (loaded by Claude Code)
- `REFERENCE.md` — advanced patterns reference
- `scripts/extract.mjs` — one-command extraction with automatic fallback
- `scripts/cdp-eval.mjs` — CDP WebSocket eval helper (Node 22+)

The installer also checks all dependencies and reports their status.

### Step 5: Enable Chrome CDP (optional)

To use the chrome-cdp tier (Tier 3), launch Chrome with remote debugging enabled:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

Or add `--remote-debugging-port=9222` to your Chrome shortcut. The CDP tier uses your real Chrome session (with all your logged-in cookies), which bypasses bot detection that blocks headless browsers.

### Step 6: Verify installation

```bash
# Run the 35-case test suite
node ~/Documents/web-interact-skill/skill/scripts/test-extract.mjs

# Quick smoke test
node ~/.claude/skills/web-interact/scripts/extract.mjs https://example.com
```

Expected: 35/35 passed (100%). If agent-browser or Chrome CDP is unavailable, some tests may fall back to curl or fail gracefully.

### Step 7: Use in Claude Code

The skill auto-activates when you ask to "scrape a page", "get info from website", "extract data from site", etc. Or invoke directly with `/web-interact`.

## Prerequisites Summary

| Tool | Required | Tier | Install |
|------|----------|------|---------|
| Node.js 18+ | Yes | All | `brew install node` |
| agent-browser | Yes | Tier 2 | `npm i -g agent-browser` + Playwright chromium |
| browser-use | Optional | Tier 2.5 | `uv tool install browser-use && browser-use install` |
| Node.js 22+ | Optional | Tier 3 | `brew install node@22` (for CDP WebSocket) |
| Chrome with `--remote-debugging-port=9222` | Optional | Tier 3 | Launch Chrome with flag |
| ghost-os | Optional | Tier 5 | MCP server (see ghost-os docs) |

## How It Works

### Strategy: 6-Tier Automatic Escalation

1. **curl fast-path** (1-2s) — works for static content, APIs, server-rendered HTML
2. **agent-browser** (5-15s) — JavaScript rendering, SPAs, form interaction
2.5. **browser-use** (10-60s) — autonomous multi-step tasks, form filling, exploration
3. **chrome-cdp via cdp-eval.mjs** (3-10s) — real Chrome session, bypasses bot detection
4. **curl -k** (1-2s) — last-resort TLS skip for self-signed certs
5. **ghost-os** (manual) — desktop apps, CAPTCHA, visual grounding

`extract.mjs` runs tiers 1–4 automatically as a **strategy array loop**: each tier is a function in an array; the loop calls each in order and stops at the first non-empty result. Key internals:

- **`BOT_PATTERNS`** — constant array of strings (`cf-challenge`, `just a moment`, `cloudflare ray id`, etc.) checked against curl and browser output to detect challenge pages before returning content
- **`buildContentJS(selector)`** — helper that builds the JS extraction expression: CSS selector query when a selector is given, or a smart semantic-element priority scan (`article`, `main`, `[role="main"]`, `.content`, `#content`) falling back to `document.body.innerText`
- **`findNode22()`** — helper that probes candidate paths for a Node.js ≥22 binary (required for built-in WebSocket used by `cdp-eval.mjs`)

### Decision Tree

```
Is it read-only content extraction?
  → Try curl/WebFetch first (fastest)
  → If empty/blocked → agent-browser

Is it a JavaScript-rendered SPA?
  → agent-browser with wait --load load + delay

Multi-step task (search → click → fill → submit)?
  → browser-use task "describe the goal"

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

### browser-use workflow

For multi-step autonomous tasks (3+ distinct interactions), see [SKILL.md](skill/SKILL.md#workflow-b-browser-use-tier-25--autonomous-tasks) for full usage.

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
| Chrome CDP (logged-in) | chrome-cdp + cdp-eval.mjs | ~5s |
| Multi-step autonomous task | browser-use | 10-60s |

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
cp ~/Documents/web-interact-skill/evoskill/webextract_task.py src/
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
- **Chrome CDP uses HTTP API only for tab management** (no shell interpolation); WebSocket connection is direct to localhost

## Skill Files

| File | Purpose |
|------|---------|
| `skill/SKILL.md` | Main instructions (loaded by Claude Code) |
| `skill/REFERENCE.md` | Advanced patterns, auth, cookies, network |
| `skill/scripts/extract.mjs` | One-command extraction with strategy array (curl→browser→cdp→curl-k) |
| `skill/scripts/cdp-eval.mjs` | CDP WebSocket eval helper (Node 22+), copied to skill dir by install.sh |
| `skill/scripts/test-extract.mjs` | Test harness with 35 diverse URL test cases |
| `evoskill/webextract_task.py` | Shared task registration module for EvoSkill evaluation scripts |

## Changelog

### v0.6.0 — Browser Use + Code Simplification (2026-03-21)

- **Browser Use CLI 2.0 as Tier 2.5** — autonomous multi-step web tasks (search → click → fill → submit) via `browser-use task "goal"`
- **6-Tier architecture** — curl → agent-browser → browser-use → chrome-cdp → curl -k → ghost-os
- **extract.mjs simplified** — BOT_PATTERNS constant (3→1), buildContentJS helper (2→1), findNode22 Array.find, strategy array loop. Net -57 lines.
- **cdp-eval.mjs hardened** — dynamic timeout, no magic numbers, simplified output
- **install.sh improved** — copies cdp-eval.mjs, detects uv-installed browser-use
- **Shared webextract_task.py** — eliminated duplication between eval/loop runners
- **Test harness hardened** — spawnSync (no shell injection), derived counters, fixed expectFail logic
- **Bot detection refined** — `cloudflare` → `cloudflare ray id` to avoid false positives on legitimate content
- **Short response fix** — plain text/JSON responses bypass HTML min-length check

## License

MIT
