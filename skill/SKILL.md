---
name: web-interact
description: Unified web page interaction when WebFetch fails. Combines agent-browser (headless Playwright), browser-use (autonomous AI agent), chrome-cdp (existing Chrome tabs), and ghost-os (desktop GUI/vision). Use when asked to "scrape a page", "get info from website", "grab info from", "read this URL", "fetch content from", "fill a form", "click a button", "interact with web page", "automate browser", "extract data from site", "summarize this page", "what does this link say", "study this", "research this URL", "access this link", "check this page", "look at this", "read this article", "open this link", "what's on this page", "get content from this URL", "visit this site", or when WebFetch returns empty/blocked content. Handles SPAs (React, Next.js, Vue), login-required pages via CDP, and bot-protected sites. Use as automatic fallback when WebFetch returns empty, blocked, or authentication-required content.
allowed-tools:
  - Bash(agent-browser:*)
  - Bash(npx agent-browser:*)
  - Bash(browser-use:*)
  - Bash(*cdp.mjs*)
  - Bash(curl:*)
  - Bash(node*extract.mjs*)
  - Read
  - mcp__ghost-os__ghost_context
  - mcp__ghost-os__ghost_find
  - mcp__ghost-os__ghost_click
  - mcp__ghost-os__ghost_type
  - mcp__ghost-os__ghost_press
  - mcp__ghost-os__ghost_wait
  - mcp__ghost-os__ghost_read
  - mcp__ghost-os__ghost_ground
  - mcp__ghost-os__ghost_screenshot
---

# Web Interact

## Strategy: 5-Tier Automatic Escalation

**1. curl fast-path** (1-2s) — static content, APIs, JSON, XML, plain text.
**2. agent-browser** (5-15s) — JS rendering, SPAs, form interaction.
**2.5. browser-use** (10-60s) — autonomous multi-step web tasks. Give a goal, agent plans and executes clicks/navigation/forms.
**3. chrome-cdp** (3-10s) — real Chrome session via cdp-eval.mjs (Node 22 WebSocket), bypasses bot detection. Auto-tried by `extract.mjs`. Requires Chrome running with `--remote-debugging-port=9222`.
**4. curl -k** (1-2s) — last-resort TLS skip for self-signed certs.
**5. ghost-os** (manual) — desktop apps, CAPTCHA, visual grounding. Script outputs `ESCALATE` message; Claude handles via MCP tools.

The helper script `extract.mjs` runs tiers 1-4 automatically. Tier 5 requires Claude to use ghost-os MCP tools directly.

## Fast Path: curl + defuddle (try first for read-only extraction)

```bash
# Quick content grab — no browser needed (quote URLs with & or special chars)
curl -sL -m 10 -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" '<url>' | head -c 50000
```

If curl returns useful HTML, extract with JS-free methods. Skip browser entirely.

## Workflow A: agent-browser (JS-rendered pages)

```bash
# Open with robust wait chain (handles networkidle timeouts)
agent-browser open <url>
agent-browser wait --load load              # fast: wait for load event only
agent-browser wait 2000                     # brief settle for JS hydration
agent-browser snapshot -i                   # get interactive refs
```

**Do NOT use `wait --load networkidle`** on heavy sites — it hangs. Use `load` + delay instead.

For SPA pages (React/Vue/Next.js), wait for specific content:
```bash
agent-browser wait --text "Expected content"     # wait until text appears
agent-browser wait --fn "document.querySelector('.loaded') !== null"  # wait for element
```

Extract data:
```bash
agent-browser eval "document.title"
agent-browser eval "document.querySelector('article')?.innerText || document.body.innerText"
agent-browser eval "JSON.stringify([...document.querySelectorAll('h2')].map(h => h.textContent))"
agent-browser get text @e5                       # text of specific ref
agent-browser get html @e5                       # HTML of specific ref
```

After ANY navigation, always re-snapshot: `agent-browser snapshot -i`

When done, close the browser: `agent-browser close`

## Workflow B: browser-use (Tier 2.5 — autonomous tasks)

**When to use browser-use vs agent-browser:**
| Need | Tool |
|------|------|
| Extract content from a single page | agent-browser (faster) |
| Multi-step task (search → click → fill → submit) | browser-use |
| Autonomous "figure it out" task | browser-use |
| Precise CSS selector extraction | agent-browser |

Use for tasks requiring 3+ distinct interactions (e.g., search → select result → extract detail).

```bash
# Simple task — browser-use figures out the steps
browser-use task "Search for 'Claude Code' on Hacker News and extract the top 3 results"
```

**With existing Chrome profile** (reuse logins):
```bash
browser-use --profile "Default" task "Check my GitHub notifications"
```

## Workflow C: chrome-cdp (existing login session)

```bash
CDP=~/.claude/skills/chrome-cdp/scripts/cdp.mjs
$CDP list                            # find target ID prefix
$CDP snap <target>                   # accessibility tree
$CDP eval <target> "document.title"  # run JS
$CDP html <target> ".content"        # extract by CSS selector
$CDP click <target> "button.submit"  # click by CSS selector
```

## Workflow D: ghost-os (desktop/visual)

Use MCP tools directly:
1. `ghost_context(app="Chrome")` → current state
2. `ghost_find(query="Submit", app="Chrome")` → locate element
3. `ghost_click(dom_id="...", app="Chrome")` → click (dom_id most reliable)
4. `ghost_type(text="hello", app="Chrome")` → type text

## Error Recovery (auto-escalate)

| Error | Cause | Fix |
|-------|-------|-----|
| `ERR_CERT_*` / SSL error | Invalid certificate | Use `curl -k` or WebFetch instead |
| `Access Denied` / 403 | WAF/bot detection | Switch to chrome-cdp or add real User-Agent |
| `Timeout 25000ms` on wait | Heavy site | Use `wait --load load` + `wait 2000` |
| Empty body / blank page | SPA not hydrated | `wait --fn` for specific element, or increase delay |
| `net::ERR_NAME_NOT_RESOLVED` | DNS failure | Check URL, try curl fallback |
| CAPTCHA / challenge page | Bot protection | Use chrome-cdp with real session, or ghost-os |
| `browser-use` timeout / stuck | Complex page, agent confused | Simplify task description, or fall back to agent-browser for manual steps |

## Helper Script

```bash
# Quick extraction with automatic fallback
node ~/.claude/skills/web-interact/scripts/extract.mjs <url> [css-selector]
```

The CDP tier requires Node 22+ (for built-in WebSocket) and Chrome with `--remote-debugging-port=9222`.

See [REFERENCE.md](REFERENCE.md) for auth flows, cookies, network interception, and mobile emulation.
