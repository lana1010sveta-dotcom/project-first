"""Тренды из Google Trends / соцсетей через Apify."""
import asyncio
import logging
import config
from apify_client import ApifyClient

logger = logging.getLogger(__name__)

_ACTOR_ID = "emastra/google-trends-scraper"


def _run_actor(query: str) -> list[dict]:
    client = ApifyClient(token=config.APIFY_TOKEN)

    # Запрашиваем связанные запросы — это и есть «что люди ищут по теме»
    run = client.actor(_ACTOR_ID).call(
        run_input={
            "searchTerms": [query],
            "maxItems": 20,
            "geo": "RU",
            "languageCode": "ru",
        },
        timeout_secs=90,
    )
    if not run or run.get("status") != "SUCCEEDED":
        status = run.get("status") if run else "no run"
        raise ValueError(f"Apify actor завершился со статусом: {status}")

    items = client.dataset(run["defaultDatasetId"]).list_items().items
    return items or []


def _parse_items(items: list[dict], query: str) -> list[dict]:
    results = []

    for item in items:
        # Формат 1: поле «keyword» или «searchTerm» — интерес за период
        kw = item.get("keyword") or item.get("searchTerm") or item.get("query", "")
        value = item.get("value", "")
        if kw and kw.lower() != query.lower():
            results.append({
                "topic": kw[:100],
                "why": f"Интерес: {value}/100 по данным Google Trends" if value else "Популярный запрос",
                "source": "Google Trends",
            })

        # Формат 2: вложенные related queries
        for section in ("top", "rising"):
            for rq in item.get(section, []):
                rq_text = rq.get("query") or rq.get("keyword", "")
                rq_val = rq.get("value", "")
                if rq_text:
                    label = "🔺 Растущий тренд" if section == "rising" else f"Интерес: {rq_val}"
                    results.append({
                        "topic": rq_text[:100],
                        "why": label,
                        "source": "Google Trends",
                    })

    # Убираем дубли
    seen = set()
    unique = []
    for r in results:
        key = r["topic"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(r)

    return unique[:5]


async def find_social_trends(query: str) -> list[dict]:
    """Ищет тренды через Apify Google Trends. Возвращает до 5 тем."""
    loop = asyncio.get_event_loop()
    items = await loop.run_in_executor(None, _run_actor, query)
    trends = _parse_items(items, query)

    if not trends:
        # Fallback: хотя бы вернуть сам запрос как тему
        trends = [{"topic": query, "why": "Введённый запрос", "source": "Google Trends"}]

    return trends
