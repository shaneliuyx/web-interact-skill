# Web Interact — Reference Guide

## Advanced Data Extraction

### Extract structured data with agent-browser
```bash
# Tables → JSON
agent-browser eval "JSON.stringify([...document.querySelectorAll('table tr')].map(r => [...r.cells].map(c => c.textContent.trim())))"

# Links with text
agent-browser eval "JSON.stringify([...document.querySelectorAll('a[href]')].map(a => ({text: a.textContent.trim(), href: a.href})))"

# Meta tags
agent-browser eval "JSON.stringify({title: document.title, description: document.querySelector('meta[name=description]')?.content, ogImage: document.querySelector('meta[property=\"og:image\"]')?.content})"

# All visible text (clean)
agent-browser eval "document.body.innerText"
```

### Extract with chrome-cdp
```bash
CDP=~/.claude/skills/chrome-cdp/scripts/cdp.mjs
# Run complex JS extraction
$CDP eval <target> "JSON.stringify([...document.querySelectorAll('.item')].map(el => ({title: el.querySelector('h2')?.textContent, price: el.querySelector('.price')?.textContent})))"

# Get full page HTML
$CDP html <target>

# Get specific element HTML
$CDP html <target> "article.main-content"
```

## Cookie & Session Management

### agent-browser sessions
```bash
# Save session state (cookies + localStorage)
agent-browser state save my-session

# Restore in future
agent-browser state load my-session

# Named persistent session (auto-save/restore)
agent-browser --session-name github open https://github.com

# View cookies
agent-browser cookies

# Set cookies
agent-browser cookies set '{"name":"token","value":"abc123","domain":".example.com"}'
```

### chrome-cdp cookies
```bash
CDP=~/.claude/skills/chrome-cdp/scripts/cdp.mjs
$CDP evalraw <target> "Network.getCookies" '{}'
$CDP evalraw <target> "Network.setCookie" '{"name":"key","value":"val","domain":".example.com"}'
```

## Authentication Flows

### agent-browser auth vault (encrypted credentials)
```bash
# Save credentials (encrypted at rest)
agent-browser auth save mysite
# Prompts for username/password — LLM never sees raw password

# Login using saved credentials
agent-browser auth login mysite
```

### Manual login with ghost-os assist

> **Security note:** Credentials typed via ghost_type appear in conversation context and may be logged. Prefer `agent-browser auth save/login` for credential management. Only use ghost-os for login flows that require visual interaction (CAPTCHA, 2FA).

```
1. ghost_hotkey(keys=["cmd","l"], app="Chrome")
2. ghost_type(text="https://login.example.com")
3. ghost_press(key="return", app="Chrome")
4. ghost_wait(condition="urlContains", value="login", app="Chrome")
5. ghost_find(query="Email", app="Chrome") → get dom_id
6. ghost_click(dom_id="...", app="Chrome")
7. ghost_type(text="user@example.com", app="Chrome")
8. ghost_press(key="tab", app="Chrome")
9. ghost_type(text="<password>", app="Chrome")   # avoid hardcoding real passwords
10. ghost_press(key="return", app="Chrome")
11. ghost_wait(condition="urlContains", value="dashboard", app="Chrome")
```

## Network Interception (agent-browser)

```bash
# Block images for faster loading
agent-browser network route "**/*.{png,jpg,gif}" --abort

# Mock API response
agent-browser network route "*/api/user" --fulfill '{"name":"Test User"}'

# View all network requests
agent-browser network requests
```

## Handling Infinite Scroll / Load More

### agent-browser
```bash
# Scroll to bottom repeatedly
agent-browser scroll down
agent-browser wait 1000
agent-browser scroll down
agent-browser wait 1000
# Check if new content loaded
agent-browser eval "document.body.scrollHeight"
```

### chrome-cdp loadall
```bash
CDP=~/.claude/skills/chrome-cdp/scripts/cdp.mjs
# Auto-click "Load More" until gone (5-min cap)
$CDP loadall <target> "button.load-more" 2000
```

## PDF Generation

```bash
agent-browser pdf output.pdf
```

## Mobile Device Emulation

```bash
agent-browser set device "iPhone 14"
agent-browser open https://example.com
agent-browser screenshot mobile.png
```

## Multi-Tab Operations

```bash
agent-browser tab new
agent-browser open https://second-page.com
agent-browser tab 1      # switch back to first tab
agent-browser tab close   # close current tab
```

## Diff / Regression Testing

```bash
# Snapshot-based diff
agent-browser snapshot -i > before.txt
# ... make changes ...
agent-browser snapshot -i > after.txt
agent-browser diff snapshot

# Visual diff between URLs
agent-browser diff url https://staging.example.com https://prod.example.com
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| agent-browser: page empty after open | Use `wait --load load` + `wait 2000` before snapshot (NOT networkidle — it hangs on heavy sites) |
| agent-browser: refs don't match visible UI | Use `snapshot -C` for cursor-interactive divs |
| chrome-cdp: "Allow debugging?" dialog | Opens once per tab; after that, daemon persists |
| chrome-cdp: clickxy misses target | Divide screenshot px by DPR (shown in `shot` output) |
| ghost-os: ghost_find returns nothing in Chrome | Chrome renders web elements as AXGroup — use `dom_id` |
| ghost-os: ghost_ground slow | Always pass `crop_box` parameter (250ms vs 3s) |
| 403 / Cloudflare challenge | Try chrome-cdp with existing session, or ghost-os for visual solving |
| CAPTCHA blocking | Use ghost-os visual tools or escalate to user |

## Quick Extraction Helper

For simple read-only extraction with automatic curl→browser fallback:

```bash
node ~/.claude/skills/web-interact/scripts/extract.mjs <url> [css-selector]
```

- Tries curl first (1-2s), falls back to agent-browser (5-15s), then curl with TLS skip
- URL is validated and sanitized before use
- CSS selectors require the browser path (curl path skips them automatically)
