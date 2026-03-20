---
name: web-interact
description: Unified web page interaction when WebFetch fails. Combines agent-browser (headless Playwright), chrome-cdp (existing Chrome tabs), and ghost-os (desktop GUI/vision). Use when asked to "scrape a page", "get info from website", "fill a form", "click a button", "interact with web page", "automate browser", "extract data from site", or when WebFetch returns empty/blocked content.
allowed-tools:
  - Bash(agent-browser:*)
  - Bash(npx agent-browser:*)
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

## Strategy: Fast-Path First, Escalate on Failure

**1. Try WebFetch/curl first** (fastest, 1-2s) — works for static content, APIs, simple HTML.
**2. If blocked/empty → agent-browser** (5-15s) — JS rendering, SPAs, interaction.
**3. If bot-detected → chrome-cdp** (instant) — uses your real Chrome session.
**4. If non-browser → ghost-os** — desktop apps, visual grounding.

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

## Workflow B: chrome-cdp (existing login session)

```bash
CDP=~/.claude/skills/chrome-cdp/scripts/cdp.mjs
$CDP list                            # find target ID prefix
$CDP snap <target>                   # accessibility tree
$CDP eval <target> "document.title"  # run JS
$CDP html <target> ".content"        # extract by CSS selector
$CDP click <target> "button.submit"  # click by CSS selector
```

## Workflow C: ghost-os (desktop/visual)

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

## Helper Script

```bash
# Quick extraction with automatic fallback
node ~/.claude/skills/web-interact/scripts/extract.mjs <url> [css-selector]
```

See [REFERENCE.md](REFERENCE.md) for auth flows, cookies, network interception, and mobile emulation.
