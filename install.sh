#!/bin/bash
# web-interact skill installer
set -e

SKILL_DIR="$HOME/.claude/skills/web-interact"

echo "Installing web-interact skill..."

# Create skill directory
mkdir -p "$SKILL_DIR/scripts"

# Copy skill files
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/skill/SKILL.md" "$SKILL_DIR/"
cp "$SCRIPT_DIR/skill/REFERENCE.md" "$SKILL_DIR/"
cp "$SCRIPT_DIR/skill/scripts/extract.mjs" "$SKILL_DIR/scripts/"
chmod +x "$SKILL_DIR/scripts/extract.mjs"
cp "$SCRIPT_DIR/skill/scripts/cdp-eval.mjs" "$SKILL_DIR/scripts/"
chmod +x "$SKILL_DIR/scripts/cdp-eval.mjs"
cp "$SCRIPT_DIR/skill/scripts/webfetch-fallback.mjs" "$SKILL_DIR/scripts/"
chmod +x "$SKILL_DIR/scripts/webfetch-fallback.mjs"

echo "Skill installed to $SKILL_DIR"

# Check dependencies
echo ""
echo "Checking dependencies..."

if command -v agent-browser &>/dev/null; then
    echo "  ✓ agent-browser $(agent-browser --version 2>/dev/null)"
else
    echo "  ✗ agent-browser not found. Install: npm i -g agent-browser"
fi

if command -v browser-use &>/dev/null || uv tool list 2>/dev/null | grep -q browser-use; then
    echo "  ✓ browser-use CLI found"
else
    echo "  ✗ browser-use not found (optional — install with: uv tool install browser-use && browser-use install)"
fi

if command -v ghost &>/dev/null; then
    echo "  ✓ ghost-os $(ghost --version 2>/dev/null)"
else
    echo "  ✗ ghost-os not found. Install: brew install ghost-os"
fi

if [ -f "$HOME/.claude/skills/chrome-cdp/scripts/cdp.mjs" ]; then
    echo "  ✓ chrome-cdp skill found"
else
    echo "  ✗ chrome-cdp skill not found (optional — for existing Chrome sessions)"
fi

echo ""
echo "Optional: Auto-fallback when WebFetch fails"
echo "Add this to your Claude Code settings.json (hooks section):"
echo '  "PostToolUse": [{'
echo '    "matcher": "WebFetch",'
echo '    "hooks": [{'
echo '      "type": "command",'
echo '      "command": "node ~/.claude/skills/web-interact/scripts/webfetch-fallback.mjs"'
echo '    }]'
echo '  }]'
echo ""
echo "Done! The web-interact skill is now available in Claude Code."
echo "Invoke with: /web-interact"
