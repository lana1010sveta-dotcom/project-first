import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
FAL_API_KEY: str = os.getenv("FAL_API_KEY", "")
APIFY_TOKEN: str = os.getenv("APIFY_TOKEN", "")
ALLOWED_USER_ID: int = int(os.getenv("ALLOWED_USER_ID", "5166343410"))

BASE_DIR = Path(__file__).parent

MODELS = {
    "opus":       os.getenv("MODEL_OPUS",       "anthropic/claude-opus-4-5"),
    "sonnet":     os.getenv("MODEL_SONNET",     "anthropic/claude-sonnet-4-5"),
    "haiku":      os.getenv("MODEL_HAIKU",      "anthropic/claude-haiku-4-5"),
    "researcher": os.getenv("MODEL_RESEARCHER", "perplexity/sonar"),
    "image":      os.getenv("MODEL_IMAGE",      "openai/gpt-5-image-mini"),
}


def _load(filename: str) -> str:
    path = BASE_DIR / filename
    return path.read_text(encoding="utf-8") if path.exists() else ""


TONE_OF_VOICE      = _load("tone-of-voice.md")
CONTENT_PLAN_TEXT  = _load("content-plan.md")
AUDIENCE           = _load("audience.md")
POSTS_DRAFT        = _load("posts-draft.md")
