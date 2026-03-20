from pathlib import Path
from claude_agent_sdk import ClaudeAgentOptions
from src.schemas import AgentResponse
from src.agent_profiles.skill_generator import get_project_root


WEBEXTRACT_AGENT_TOOLS = [
    "Read", "Write", "Bash", "Glob", "Grep", "Edit",
    "WebFetch", "WebSearch", "TodoWrite", "BashOutput", "Skill"
]

PROMPT_FILE = Path(__file__).parent / "prompt.txt"


def get_webextract_agent_options(model: str | None = None) -> ClaudeAgentOptions:
    """Factory that creates ClaudeAgentOptions for web extraction tasks.

    Reads prompt.txt from disk each time for hot-reloading during evolution.
    """
    prompt_text = PROMPT_FILE.read_text().strip()

    system_prompt = {
        "type": "preset",
        "preset": "claude_code",
        "append": prompt_text
    }

    output_format = {
        "type": "json_schema",
        "schema": AgentResponse.model_json_schema()
    }

    options = ClaudeAgentOptions(
        system_prompt=system_prompt,
        output_format=output_format,
        allowed_tools=WEBEXTRACT_AGENT_TOOLS,
        setting_sources=["user", "project"],
        permission_mode='acceptEdits',
        cwd=get_project_root(),
        max_buffer_size=10 * 1024 * 1024,
    )

    if model:
        options.model = model

    return options


def make_webextract_agent_options(model: str | None = None):
    """Create a factory function for webextract agent options."""
    def factory() -> ClaudeAgentOptions:
        return get_webextract_agent_options(model=model)
    return factory
