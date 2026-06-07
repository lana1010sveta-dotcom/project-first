"""Простое JSON-хранилище для опубликованных постов и контент-плана."""
import json
from pathlib import Path
from datetime import datetime

_FILE = Path(__file__).parent / "storage.json"


def _load() -> dict:
    if _FILE.exists():
        return json.loads(_FILE.read_text(encoding="utf-8"))
    return {"published_posts": [], "content_plan": [], "style_tweaks": []}


def _save(data: dict) -> None:
    _FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# --- Посты ---

def get_published_posts() -> list[dict]:
    return _load()["published_posts"]


def save_post(topic: str, post_text: str, score: str = "") -> None:
    data = _load()
    data["published_posts"].append({
        "date": datetime.now().isoformat(timespec="seconds"),
        "topic": topic,
        "text": post_text,
        "score": score,
    })
    _save(data)


# --- Контент-план ---

def get_content_plan() -> list[dict]:
    return _load()["content_plan"]


def save_content_plan(plan: list[dict]) -> None:
    data = _load()
    data["content_plan"] = plan
    _save(data)


def mark_post_done(index: int) -> None:
    data = _load()
    plan = data["content_plan"]
    if 0 <= index < len(plan):
        plan[index]["status"] = "published"
    _save(data)


# --- Правки стиля ---

def get_style_tweaks() -> list[str]:
    return _load().get("style_tweaks", [])


def toggle_style_tweak(tweak_id: str) -> bool:
    """Включает или выключает правку. Возвращает True если правка добавлена."""
    data = _load()
    tweaks = data.get("style_tweaks", [])
    if tweak_id in tweaks:
        tweaks.remove(tweak_id)
        data["style_tweaks"] = tweaks
        _save(data)
        return False
    tweaks.append(tweak_id)
    data["style_tweaks"] = tweaks
    _save(data)
    return True


def clear_style_tweaks() -> None:
    data = _load()
    data["style_tweaks"] = []
    _save(data)
