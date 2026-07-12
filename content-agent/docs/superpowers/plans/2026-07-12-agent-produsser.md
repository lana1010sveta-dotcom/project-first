# Agent Produsser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автономный Telegram-бот, который раз в месяц генерирует контент-план, создаёт посты с обложками (Claude + DALL-E 3) и публикует их в канал после одобрения владельца.

**Architecture:** Шесть модулей с чёткими границами: storage (SQLite) ← planner / generator / publisher ← bot (оркестратор) + scheduler (триггеры). Бот одобрения — единственная точка входа для пользователя.

**Tech Stack:** Python 3.11+, python-telegram-bot 20.x (async), anthropic SDK, openai SDK, httpx, aiosqlite, APScheduler 3.x, python-dotenv, pytest + pytest-asyncio

## Global Constraints

- Python 3.11+
- python-telegram-bot==20.8 (async API, не использовать устаревший sync-интерфейс)
- Бот отвечает ТОЛЬКО пользователю с chat_id == ADMIN_CHAT_ID (из .env)
- Все файлы в `c:/projects/content-agent/`
- Тесты в `c:/projects/content-agent/tests/`
- Изображения сохраняются в `c:/projects/content-agent/images/`
- `.env` никогда не коммитить (добавить в .gitignore)
- Claude model: `claude-sonnet-5` (последняя модель, ID: `claude-sonnet-5`)
- DALL-E model: `dall-e-3`, size `1024x1024`, quality `standard`

---

### Task 1: Scaffold + storage.py

**Files:**
- Create: `c:/projects/content-agent/requirements.txt`
- Create: `c:/projects/content-agent/.env.example`
- Create: `c:/projects/content-agent/.gitignore`
- Create: `c:/projects/content-agent/storage.py`
- Create: `c:/projects/content-agent/tests/__init__.py`
- Create: `c:/projects/content-agent/tests/test_storage.py`

**Interfaces:**
- Produces:
  - `init_db() -> None`
  - `save_plan_topics(topics: list[dict], month: str) -> list[int]` — topic dict: `{topic: str, description: str}`
  - `approve_topics(ids: list[int]) -> None`
  - `get_next_queued_topic() -> dict | None` — returns plan row as dict or None
  - `save_post(plan_id: int | None, title: str, text: str, hashtags: str, image_url: str, image_path: str) -> int`
  - `get_post(post_id: int) -> dict | None`
  - `update_post_status(post_id: int, status: str) -> None`
  - `update_post_text(post_id: int, text: str) -> None`
  - `update_plan_status(plan_id: int, status: str) -> None`
  - `get_status_summary() -> dict` — returns `{queued: int, published: int, pending_approval: int}`

- [ ] **Step 1: Создать requirements.txt**

```
python-telegram-bot==20.8
anthropic>=0.34.0
openai>=1.40.0
httpx>=0.27.0
aiosqlite>=0.20.0
APScheduler>=3.10.4
python-dotenv>=1.0.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
```

- [ ] **Step 2: Создать .env.example**

```
BOT_TOKEN=your_bot_token_here
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
CHANNEL_ID=@your_channel_or_-100xxxxxxxxxx
ADMIN_CHAT_ID=123456789
POST_TIME=09:00
TIMEZONE=Europe/Minsk
```

- [ ] **Step 3: Создать .gitignore**

```
.env
data.db
images/
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 4: Написать failing тест для storage**

Создать `tests/test_storage.py`:

```python
import asyncio
import os
import pytest
import pytest_asyncio

os.environ.setdefault("DB_PATH", ":memory:")

import storage

@pytest.fixture(autouse=True)
def use_in_memory_db(monkeypatch, tmp_path):
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "test.db"))

@pytest.mark.asyncio
async def test_init_db_creates_tables():
    await storage.init_db()
    # should not raise

@pytest.mark.asyncio
async def test_save_and_approve_topics():
    await storage.init_db()
    topics = [
        {"topic": "Тема 1", "description": "Описание 1"},
        {"topic": "Тема 2", "description": "Описание 2"},
    ]
    ids = await storage.save_plan_topics(topics, "2026-07")
    assert len(ids) == 2

    await storage.approve_topics([ids[0]])
    topic = await storage.get_next_queued_topic()
    assert topic is not None
    assert topic["topic"] == "Тема 1"
    assert topic["status"] == "queued"

@pytest.mark.asyncio
async def test_get_next_queued_returns_none_when_empty():
    await storage.init_db()
    result = await storage.get_next_queued_topic()
    assert result is None

@pytest.mark.asyncio
async def test_save_and_get_post():
    await storage.init_db()
    post_id = await storage.save_post(
        plan_id=None,
        title="Заголовок",
        text="Текст поста",
        hashtags="#тег1 #тег2",
        image_url="https://example.com/img.png",
        image_path="/tmp/img.png",
    )
    post = await storage.get_post(post_id)
    assert post["title"] == "Заголовок"
    assert post["status"] == "generated"

@pytest.mark.asyncio
async def test_update_post_status():
    await storage.init_db()
    post_id = await storage.save_post(None, "T", "Text", "#h", "u", "p")
    await storage.update_post_status(post_id, "published")
    post = await storage.get_post(post_id)
    assert post["status"] == "published"
    assert post["published_at"] is not None

@pytest.mark.asyncio
async def test_status_summary():
    await storage.init_db()
    topics = [{"topic": "T", "description": "D"}]
    ids = await storage.save_plan_topics(topics, "2026-07")
    await storage.approve_topics(ids)
    post_id = await storage.save_post(None, "T", "Text", "#h", "u", "p")
    await storage.update_post_status(post_id, "published")

    summary = await storage.get_status_summary()
    assert summary["queued"] == 1
    assert summary["published"] == 1
    assert summary["pending_approval"] == 0
```

- [ ] **Step 5: Запустить тесты — убедиться что падают**

```
cd c:/projects/content-agent
pip install -r requirements.txt
pytest tests/test_storage.py -v
```

Ожидаемый результат: `ModuleNotFoundError: No module named 'storage'`

- [ ] **Step 6: Написать storage.py**

```python
import os
import aiosqlite

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS plan (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic TEXT NOT NULL,
                description TEXT DEFAULT '',
                month TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER REFERENCES plan(id),
                title TEXT DEFAULT '',
                text TEXT NOT NULL,
                hashtags TEXT DEFAULT '',
                image_url TEXT DEFAULT '',
                image_path TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'generated',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                published_at DATETIME
            )
        """)
        await db.commit()


async def save_plan_topics(topics: list[dict], month: str) -> list[int]:
    ids = []
    async with aiosqlite.connect(DB_PATH) as db:
        for t in topics:
            cursor = await db.execute(
                "INSERT INTO plan (topic, description, month) VALUES (?, ?, ?)",
                (t["topic"], t.get("description", ""), month),
            )
            ids.append(cursor.lastrowid)
        await db.commit()
    return ids


async def approve_topics(ids: list[int]) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        for id_ in ids:
            await db.execute("UPDATE plan SET status='queued' WHERE id=?", (id_,))
        await db.commit()


async def get_next_queued_topic() -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM plan WHERE status='queued' ORDER BY id LIMIT 1"
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def save_post(
    plan_id: int | None,
    title: str,
    text: str,
    hashtags: str,
    image_url: str,
    image_path: str,
) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO posts (plan_id, title, text, hashtags, image_url, image_path) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (plan_id, title, text, hashtags, image_url, image_path),
        )
        await db.commit()
        return cursor.lastrowid


async def get_post(post_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM posts WHERE id=?", (post_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def update_post_status(post_id: int, status: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        if status == "published":
            await db.execute(
                "UPDATE posts SET status=?, published_at=CURRENT_TIMESTAMP WHERE id=?",
                (status, post_id),
            )
        else:
            await db.execute("UPDATE posts SET status=? WHERE id=?", (status, post_id))
        await db.commit()


async def update_post_text(post_id: int, text: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE posts SET text=? WHERE id=?", (text, post_id))
        await db.commit()


async def update_plan_status(plan_id: int, status: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE plan SET status=? WHERE id=?", (status, plan_id))
        await db.commit()


async def get_status_summary() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM plan WHERE status='queued'"
        ) as c:
            queued = (await c.fetchone())[0]
        async with db.execute(
            "SELECT COUNT(*) FROM posts WHERE status='published'"
        ) as c:
            published = (await c.fetchone())[0]
        async with db.execute(
            "SELECT COUNT(*) FROM posts WHERE status='generated'"
        ) as c:
            pending = (await c.fetchone())[0]
    return {"queued": queued, "published": published, "pending_approval": pending}
```

- [ ] **Step 7: Запустить тесты — убедиться что проходят**

```
pytest tests/test_storage.py -v
```

Ожидаемый результат: все 6 тестов PASSED

- [ ] **Step 8: Коммит**

```
git add storage.py requirements.txt .env.example .gitignore tests/
git commit -m "feat: storage layer with SQLite (plan + posts tables)"
```

---

### Task 2: planner.py

**Files:**
- Create: `c:/projects/content-agent/planner.py`
- Create: `c:/projects/content-agent/tests/test_planner.py`

**Interfaces:**
- Consumes: `audience.md` (читает как файл), `ANTHROPIC_API_KEY` из env
- Produces:
  - `generate_monthly_plan(month: str) -> list[dict]` — month = `"YYYY-MM"`, возвращает `[{topic: str, description: str}, ...]`

- [ ] **Step 1: Написать failing тест**

Создать `tests/test_planner.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import os

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

import planner

MOCK_CLAUDE_RESPONSE = """ТЕМА: Что делать если клиент не пришёл | ОПИСАНИЕ: Разбор no-show и как защититься
ТЕМА: Запись через директ — почему это хаос | ОПИСАНИЕ: Реальные потери из-за ручной переписки
ТЕМА: Бесплатная альтернатива YClients | ОПИСАНИЕ: Обзор решений для соло-мастера"""


@pytest.mark.asyncio
async def test_generate_monthly_plan_returns_list():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=MOCK_CLAUDE_RESPONSE)]

    with patch.object(planner.anthropic_client.messages, "create", new=AsyncMock(return_value=mock_response)):
        result = await planner.generate_monthly_plan("2026-07")

    assert isinstance(result, list)
    assert len(result) == 3
    assert result[0]["topic"] == "Что делать если клиент не пришёл"
    assert "no-show" in result[0]["description"]


@pytest.mark.asyncio
async def test_generate_monthly_plan_skips_malformed_lines():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="Это строка без нужного формата\nТЕМА: Норм тема | ОПИСАНИЕ: Норм описание")]

    with patch.object(planner.anthropic_client.messages, "create", new=AsyncMock(return_value=mock_response)):
        result = await planner.generate_monthly_plan("2026-07")

    assert len(result) == 1
    assert result[0]["topic"] == "Норм тема"
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```
pytest tests/test_planner.py -v
```

Ожидаемый результат: `ModuleNotFoundError: No module named 'planner'`

- [ ] **Step 3: Написать planner.py**

```python
import os
from pathlib import Path
from anthropic import AsyncAnthropic

anthropic_client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

AUDIENCE_PATH = Path(__file__).parent / "audience.md"


async def generate_monthly_plan(month: str) -> list[dict]:
    """Generate 20-30 content topics for a given month from audience.md.

    Args:
        month: "YYYY-MM" format

    Returns:
        List of {topic: str, description: str}
    """
    audience_content = AUDIENCE_PATH.read_text(encoding="utf-8")

    response = await anthropic_client.messages.create(
        model="claude-sonnet-5",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": (
                    f"На основе аудиторного исследования составь контент-план на {month} "
                    "для Telegram-канала о Telegram мини-аппах для записи клиентов "
                    "в малом бизнесе (бьюти, репетиторы, психологи, коучи).\n\n"
                    f"Исследование аудитории:\n{audience_content[:6000]}\n\n"
                    "Создай 25 тем для постов. Каждая тема:\n"
                    "- Конкретная боль или вопрос из исследования (не абстрактная)\n"
                    "- Написана как заголовок поста, не как категория\n\n"
                    "Верни строго в формате (одна тема на строку, без нумерации):\n"
                    "ТЕМА: <тема> | ОПИСАНИЕ: <одна строка описания>"
                ),
            }
        ],
    )

    topics = []
    for line in response.content[0].text.strip().split("\n"):
        if "ТЕМА:" in line and "ОПИСАНИЕ:" in line:
            parts = line.split("|")
            topic = parts[0].replace("ТЕМА:", "").strip()
            description = parts[1].replace("ОПИСАНИЕ:", "").strip() if len(parts) > 1 else ""
            if topic:
                topics.append({"topic": topic, "description": description})

    return topics
```

- [ ] **Step 4: Запустить тесты**

```
pytest tests/test_planner.py -v
```

Ожидаемый результат: 2 теста PASSED

- [ ] **Step 5: Коммит**

```
git add planner.py tests/test_planner.py
git commit -m "feat: planner generates monthly topics from audience.md via Claude"
```

---

### Task 3: generator.py

**Files:**
- Create: `c:/projects/content-agent/generator.py`
- Create: `c:/projects/content-agent/images/.gitkeep`
- Create: `c:/projects/content-agent/tests/test_generator.py`

**Interfaces:**
- Consumes: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` из env; `audience.md` как файл
- Produces:
  - `generate_post(topic: str) -> dict` — returns `{title: str, text: str, hashtags: str}`
  - `generate_image(topic: str, title: str) -> tuple[str, str]` — returns `(image_url, local_path)`
  - `generate_post_with_image(topic: str) -> dict` — returns `{title, text, hashtags, image_url, image_path}`

- [ ] **Step 1: Написать failing тесты**

Создать `tests/test_generator.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, mock_open
import os
from pathlib import Path

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("OPENAI_API_KEY", "test-key")

import generator

MOCK_POST_RESPONSE = """ЗАГОЛОВОК: Почему клиенты не приходят
ТЕКСТ: Три месяца назад у меня было 30% no-show каждую неделю.
Я теряла деньги и нервы. Оказалось, проблема была простой.
Клиенты просто забывали. Теперь бот напоминает им за 24 часа и за 2 часа.
No-show упал до 5%. Это реально работает.
ХЭШТЕГИ: #запись_клиентов #бьюти_мастер #telegram_бот"""


@pytest.mark.asyncio
async def test_generate_post_returns_all_fields():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=MOCK_POST_RESPONSE)]

    with patch.object(generator.anthropic_client.messages, "create", new=AsyncMock(return_value=mock_response)):
        result = await generator.generate_post("Как снизить no-show")

    assert result["title"] == "Почему клиенты не приходят"
    assert "no-show" in result["text"].lower()
    assert "#запись_клиентов" in result["hashtags"]


@pytest.mark.asyncio
async def test_generate_image_downloads_file(tmp_path):
    mock_image_response = MagicMock()
    mock_image_response.data = [MagicMock(url="https://example.com/image.png")]

    mock_http_response = MagicMock()
    mock_http_response.content = b"fake_image_bytes"

    with patch.object(generator.openai_client.images, "generate", new=AsyncMock(return_value=mock_image_response)), \
         patch("generator.IMAGES_DIR", tmp_path), \
         patch("httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__ = AsyncMock(return_value=MagicMock(
            get=AsyncMock(return_value=mock_http_response)
        ))
        mock_client.return_value.__aexit__ = AsyncMock(return_value=False)

        url, path = await generator.generate_image("no-show тема", "Почему клиенты не приходят")

    assert url == "https://example.com/image.png"
    assert Path(path).suffix == ".png"


@pytest.mark.asyncio
async def test_generate_post_with_image_combines_both(tmp_path):
    mock_post_response = MagicMock()
    mock_post_response.content = [MagicMock(text=MOCK_POST_RESPONSE)]

    mock_image_response = MagicMock()
    mock_image_response.data = [MagicMock(url="https://example.com/img.png")]

    mock_http_response = MagicMock()
    mock_http_response.content = b"bytes"

    with patch.object(generator.anthropic_client.messages, "create", new=AsyncMock(return_value=mock_post_response)), \
         patch.object(generator.openai_client.images, "generate", new=AsyncMock(return_value=mock_image_response)), \
         patch("generator.IMAGES_DIR", tmp_path), \
         patch("httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__ = AsyncMock(return_value=MagicMock(
            get=AsyncMock(return_value=mock_http_response)
        ))
        mock_client.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await generator.generate_post_with_image("Как снизить no-show")

    assert "title" in result
    assert "text" in result
    assert "image_url" in result
    assert "image_path" in result
```

- [ ] **Step 2: Запустить тесты — убедиться что падают**

```
pytest tests/test_generator.py -v
```

Ожидаемый результат: `ModuleNotFoundError: No module named 'generator'`

- [ ] **Step 3: Написать generator.py**

```python
import os
import httpx
from pathlib import Path
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

anthropic_client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
openai_client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

IMAGES_DIR = Path(__file__).parent / "images"
IMAGES_DIR.mkdir(exist_ok=True)

AUDIENCE_PATH = Path(__file__).parent / "audience.md"


def _load_audience_context() -> str:
    if AUDIENCE_PATH.exists():
        return AUDIENCE_PATH.read_text(encoding="utf-8")[:3000]
    return ""


async def generate_post(topic: str) -> dict:
    """Generate post text for a given topic.

    Returns:
        {title: str, text: str, hashtags: str}
    """
    audience_context = _load_audience_context()

    response = await anthropic_client.messages.create(
        model="claude-sonnet-5",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": (
                    "Ты — контент-менеджер Telegram-канала о Telegram мини-аппах для записи клиентов.\n\n"
                    f"Контекст аудитории:\n{audience_context}\n\n"
                    f"Напиши Telegram-пост на тему: «{topic}»\n\n"
                    "Требования:\n"
                    "- Голос практика, от первого лица\n"
                    "- Длина 150–300 слов\n"
                    "- Первый абзац — цепляющий (конкретная боль или неожиданная цифра)\n"
                    "- Один конкретный пример или цифра в середине\n"
                    "- Призыв к действию или вопрос в конце\n"
                    "- 3–5 хэштегов\n\n"
                    "Верни строго в формате:\n"
                    "ЗАГОЛОВОК: <заголовок>\n"
                    "ТЕКСТ: <текст поста>\n"
                    "ХЭШТЕГИ: <хэштеги через пробел>"
                ),
            }
        ],
    )

    raw = response.content[0].text.strip()
    title, text, hashtags = "", [], ""
    section = None

    for line in raw.split("\n"):
        if line.startswith("ЗАГОЛОВОК:"):
            title = line.replace("ЗАГОЛОВОК:", "").strip()
        elif line.startswith("ТЕКСТ:"):
            section = "text"
            first = line.replace("ТЕКСТ:", "").strip()
            if first:
                text.append(first)
        elif line.startswith("ХЭШТЕГИ:"):
            section = "hashtags"
            hashtags = line.replace("ХЭШТЕГИ:", "").strip()
        elif section == "text" and not line.startswith("ХЭШТЕГИ:"):
            text.append(line)

    return {
        "title": title,
        "text": "\n".join(text).strip(),
        "hashtags": hashtags.strip(),
    }


async def generate_image(topic: str, title: str) -> tuple[str, str]:
    """Generate cover image via DALL-E 3 and save locally.

    Returns:
        (image_url, local_file_path)
    """
    prompt = (
        f"Minimalist flat illustration for a Telegram blog post about: '{topic}'. "
        "Professional, clean, suitable for a business blog about small business automation. "
        "No text in the image. Warm pastel tones, simple geometric composition."
    )

    response = await openai_client.images.generate(
        model="dall-e-3",
        prompt=prompt,
        size="1024x1024",
        quality="standard",
        n=1,
    )

    image_url = response.data[0].url
    safe_title = "".join(c for c in title[:40] if c.isalnum() or c in " _-").strip().replace(" ", "_")
    local_path = IMAGES_DIR / f"{safe_title}.png"

    async with httpx.AsyncClient() as client:
        r = await client.get(image_url, timeout=30.0)
        local_path.write_bytes(r.content)

    return image_url, str(local_path)


async def generate_post_with_image(topic: str) -> dict:
    """Generate post text + cover image.

    Returns:
        {title, text, hashtags, image_url, image_path}
    """
    post = await generate_post(topic)
    image_url, image_path = await generate_image(topic, post["title"])
    return {**post, "image_url": image_url, "image_path": image_path}
```

- [ ] **Step 4: Создать images/.gitkeep**

```
echo. > c:/projects/content-agent/images/.gitkeep
```

- [ ] **Step 5: Запустить тесты**

```
pytest tests/test_generator.py -v
```

Ожидаемый результат: 3 теста PASSED

- [ ] **Step 6: Коммит**

```
git add generator.py images/.gitkeep tests/test_generator.py
git commit -m "feat: generator creates post text (Claude) + cover image (DALL-E 3)"
```

---

### Task 4: publisher.py

**Files:**
- Create: `c:/projects/content-agent/publisher.py`
- Create: `c:/projects/content-agent/tests/test_publisher.py`

**Interfaces:**
- Consumes: `BOT_TOKEN`, `CHANNEL_ID` из env
- Produces:
  - `publish_post(text: str, hashtags: str, image_path: str) -> int` — returns Telegram message_id

- [ ] **Step 1: Написать failing тест**

Создать `tests/test_publisher.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, mock_open
import os

os.environ.setdefault("BOT_TOKEN", "123:test")
os.environ.setdefault("CHANNEL_ID", "@testchannel")

import publisher


@pytest.mark.asyncio
async def test_publish_post_sends_photo_and_returns_message_id(tmp_path):
    img = tmp_path / "cover.png"
    img.write_bytes(b"fake_png_bytes")

    mock_message = MagicMock()
    mock_message.message_id = 42

    mock_bot = AsyncMock()
    mock_bot.send_photo = AsyncMock(return_value=mock_message)

    with patch("publisher.Bot", return_value=mock_bot):
        result = await publisher.publish_post(
            text="Текст поста про no-show",
            hashtags="#бьюти #запись",
            image_path=str(img),
        )

    assert result == 42
    mock_bot.send_photo.assert_called_once()
    call_kwargs = mock_bot.send_photo.call_args.kwargs
    assert call_kwargs["chat_id"] == "@testchannel"
    assert "#бьюти" in call_kwargs["caption"]


@pytest.mark.asyncio
async def test_publish_post_truncates_long_caption(tmp_path):
    img = tmp_path / "cover.png"
    img.write_bytes(b"bytes")

    mock_bot = AsyncMock()
    mock_bot.send_photo = AsyncMock(return_value=MagicMock(message_id=1))

    long_text = "А" * 1100

    with patch("publisher.Bot", return_value=mock_bot):
        await publisher.publish_post(text=long_text, hashtags="#тег", image_path=str(img))

    caption = mock_bot.send_photo.call_args.kwargs["caption"]
    assert len(caption) <= 1024
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```
pytest tests/test_publisher.py -v
```

- [ ] **Step 3: Написать publisher.py**

```python
import os
from telegram import Bot


async def publish_post(text: str, hashtags: str, image_path: str) -> int:
    """Publish photo + caption to Telegram channel.

    Returns:
        Telegram message_id of the published message
    """
    bot = Bot(token=os.environ["BOT_TOKEN"])
    channel_id = os.environ["CHANNEL_ID"]

    caption = f"{text}\n\n{hashtags}"
    if len(caption) > 1024:
        caption = caption[:1020] + "..."

    with open(image_path, "rb") as img:
        message = await bot.send_photo(
            chat_id=channel_id,
            photo=img,
            caption=caption,
        )

    return message.message_id
```

- [ ] **Step 4: Запустить тесты**

```
pytest tests/test_publisher.py -v
```

Ожидаемый результат: 2 теста PASSED

- [ ] **Step 5: Коммит**

```
git add publisher.py tests/test_publisher.py
git commit -m "feat: publisher sends photo+caption to Telegram channel"
```

---

### Task 5: bot.py

**Files:**
- Create: `c:/projects/content-agent/bot.py`
- Create: `c:/projects/content-agent/tests/test_bot.py`

**Interfaces:**
- Consumes:
  - `storage.init_db`, `storage.save_plan_topics`, `storage.approve_topics`, `storage.get_next_queued_topic`, `storage.save_post`, `storage.get_post`, `storage.update_post_status`, `storage.update_post_text`, `storage.update_plan_status`, `storage.get_status_summary`
  - `planner.generate_monthly_plan(month: str) -> list[dict]`
  - `generator.generate_post_with_image(topic: str) -> dict`
  - `generator.generate_post(topic: str) -> dict`
  - `publisher.publish_post(text: str, hashtags: str, image_path: str) -> int`
  - `BOT_TOKEN`, `ADMIN_CHAT_ID` из env
- Produces: запущенное Telegram-приложение (точка входа)

**Conversation state (in-memory, single-user bot):**
```python
_state = {
    "waiting_for": None,       # "plan_selection" | "edit" | None
    "pending_post_id": None,   # int | None
    "pending_plan_topics": [], # list of (db_id, topic_str) when waiting for selection
}
```

- [ ] **Step 1: Написать failing тесты**

Создать `tests/test_bot.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import os

os.environ.setdefault("BOT_TOKEN", "123:test")
os.environ.setdefault("ADMIN_CHAT_ID", "999")
os.environ.setdefault("ANTHROPIC_API_KEY", "key")
os.environ.setdefault("OPENAI_API_KEY", "key")

import bot


def make_update(text: str = "", data: str = "", chat_id: int = 999):
    update = MagicMock()
    update.effective_user.id = chat_id
    update.effective_chat.id = chat_id
    update.message = MagicMock() if text else None
    update.callback_query = MagicMock() if data else None
    if text:
        update.message.text = text
        update.message.reply_text = AsyncMock()
        update.message.reply_photo = AsyncMock()
    if data:
        update.callback_query.data = data
        update.callback_query.answer = AsyncMock()
        update.callback_query.message = MagicMock()
        update.callback_query.message.reply_text = AsyncMock()
        update.callback_query.message.reply_photo = AsyncMock()
        update.callback_query.message.edit_reply_markup = AsyncMock()
    return update


@pytest.mark.asyncio
async def test_unauthorized_user_ignored():
    update = make_update(text="/status", chat_id=12345)
    context = MagicMock()
    await bot.cmd_status(update, context)
    update.message.reply_text.assert_not_called()


@pytest.mark.asyncio
async def test_status_command_replies(tmp_path):
    update = make_update(text="/status")
    context = MagicMock()

    with patch("bot.storage") as mock_storage:
        mock_storage.get_status_summary = AsyncMock(
            return_value={"queued": 5, "published": 10, "pending_approval": 2}
        )
        await bot.cmd_status(update, context)

    update.message.reply_text.assert_called_once()
    reply = update.message.reply_text.call_args[0][0]
    assert "5" in reply
    assert "10" in reply


@pytest.mark.asyncio
async def test_approve_callback_publishes_post(tmp_path):
    img = tmp_path / "img.png"
    img.write_bytes(b"bytes")

    update = make_update(data="approve:7")
    context = MagicMock()

    bot._state["pending_post_id"] = 7

    with patch("bot.storage") as mock_storage, \
         patch("bot.publisher") as mock_publisher:
        mock_storage.get_post = AsyncMock(return_value={
            "id": 7, "text": "Текст", "hashtags": "#тег",
            "image_path": str(img), "plan_id": None, "status": "generated"
        })
        mock_storage.update_post_status = AsyncMock()
        mock_publisher.publish_post = AsyncMock(return_value=101)

        await bot.callback_handler(update, context)

    mock_publisher.publish_post.assert_called_once_with(
        text="Текст", hashtags="#тег", image_path=str(img)
    )
    mock_storage.update_post_status.assert_called_once_with(7, "published")


@pytest.mark.asyncio
async def test_skip_callback_updates_status():
    update = make_update(data="skip:3")
    context = MagicMock()
    bot._state["pending_post_id"] = 3

    with patch("bot.storage") as mock_storage:
        mock_storage.get_post = AsyncMock(return_value={
            "id": 3, "plan_id": 1, "status": "generated",
            "text": "T", "hashtags": "#h", "image_path": "/p"
        })
        mock_storage.update_post_status = AsyncMock()
        mock_storage.update_plan_status = AsyncMock()

        await bot.callback_handler(update, context)

    mock_storage.update_post_status.assert_called_once_with(3, "skipped")
```

- [ ] **Step 2: Запустить тесты — убедиться что падают**

```
pytest tests/test_bot.py -v
```

- [ ] **Step 3: Написать bot.py**

```python
import asyncio
import os
from datetime import datetime
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    filters,
    ContextTypes,
)

load_dotenv()

import storage
import planner
import generator
import publisher

ADMIN_CHAT_ID = int(os.environ["ADMIN_CHAT_ID"])

# Single-user conversation state
_state = {
    "waiting_for": None,        # "plan_selection" | "edit" | None
    "pending_post_id": None,    # int | None
    "pending_plan_topics": [],  # list of (db_id, topic_str)
}


def _is_admin(update: Update) -> bool:
    return update.effective_user.id == ADMIN_CHAT_ID


async def _send_post_for_approval(chat_id: int, post: dict, context: ContextTypes.DEFAULT_TYPE):
    keyboard = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Опубликовать", callback_data=f"approve:{post['id']}"),
            InlineKeyboardButton("✏️ На правку", callback_data=f"edit:{post['id']}"),
            InlineKeyboardButton("❌ Пропустить", callback_data=f"skip:{post['id']}"),
        ]
    ])
    caption = f"<b>{post['title']}</b>\n\n{post['text']}\n\n{post['hashtags']}"
    if len(caption) > 1024:
        caption = caption[:1020] + "..."

    with open(post["image_path"], "rb") as img:
        await context.bot.send_photo(
            chat_id=chat_id,
            photo=img,
            caption=caption,
            parse_mode="HTML",
            reply_markup=keyboard,
        )
    _state["pending_post_id"] = post["id"]


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    await update.message.reply_text(
        "Agent Produsser готов.\n\n"
        "/plan — сгенерировать план на месяц\n"
        "/next — создать следующий пост из плана\n"
        "/post <тема> — срочный пост по теме\n"
        "/status — статистика"
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    summary = await storage.get_status_summary()
    await update.message.reply_text(
        f"📊 Статистика:\n"
        f"• В очереди: {summary['queued']} тем\n"
        f"• На одобрении: {summary['pending_approval']} постов\n"
        f"• Опубликовано: {summary['published']} постов"
    )


async def cmd_plan(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    month = datetime.now().strftime("%Y-%m")
    await update.message.reply_text(f"Генерирую план на {month}...")

    try:
        topics = await planner.generate_monthly_plan(month)
    except Exception as e:
        await update.message.reply_text(f"Ошибка генерации плана: {e}")
        return

    ids = await storage.save_plan_topics(topics, month)
    _state["pending_plan_topics"] = list(zip(ids, [t["topic"] for t in topics]))
    _state["waiting_for"] = "plan_selection"

    lines = [f"{i+1}. {t['topic']}" for i, t in enumerate(topics)]
    text = "План готов. Выбери темы (номера через пробел) или напиши «все»:\n\n" + "\n".join(lines)

    # Telegram message limit: 4096 chars
    if len(text) > 4096:
        text = text[:4090] + "\n..."
    await update.message.reply_text(text)


async def cmd_next(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    topic_row = await storage.get_next_queued_topic()
    if not topic_row:
        await update.message.reply_text("Очередь пуста. Запусти /plan.")
        return
    await update.message.reply_text(f"Генерирую пост: «{topic_row['topic']}»...")
    await _generate_and_send(update.effective_chat.id, topic_row["topic"], topic_row["id"], context)


async def cmd_post(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    topic = " ".join(context.args) if context.args else ""
    if not topic:
        await update.message.reply_text("Укажи тему: /post <тема>")
        return
    await update.message.reply_text(f"Генерирую срочный пост: «{topic}»...")
    await _generate_and_send(update.effective_chat.id, topic, None, context)


async def _generate_and_send(chat_id: int, topic: str, plan_id: int | None, context: ContextTypes.DEFAULT_TYPE):
    try:
        content = await generator.generate_post_with_image(topic)
    except Exception as e:
        await context.bot.send_message(chat_id=chat_id, text=f"Ошибка генерации: {e}\nПопробуй позже.")
        return

    post_id = await storage.save_post(
        plan_id=plan_id,
        title=content["title"],
        text=content["text"],
        hashtags=content["hashtags"],
        image_url=content["image_url"],
        image_path=content["image_path"],
    )
    if plan_id:
        await storage.update_plan_status(plan_id, "generated")

    post = await storage.get_post(post_id)
    await _send_post_for_approval(chat_id, post, context)


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    query = update.callback_query
    await query.answer()

    data = query.data
    if data.startswith("approve:"):
        post_id = int(data.split(":")[1])
        post = await storage.get_post(post_id)
        try:
            await publisher.publish_post(
                text=post["text"],
                hashtags=post["hashtags"],
                image_path=post["image_path"],
            )
            await storage.update_post_status(post_id, "published")
            if post["plan_id"]:
                await storage.update_plan_status(post["plan_id"], "published")
            await query.message.edit_reply_markup(None)
            await query.message.reply_text("✅ Опубликовано!")
        except Exception as e:
            await query.message.reply_text(f"Ошибка публикации: {e}")
        _state["pending_post_id"] = None

    elif data.startswith("edit:"):
        post_id = int(data.split(":")[1])
        _state["pending_post_id"] = post_id
        _state["waiting_for"] = "edit"
        await query.message.edit_reply_markup(None)
        await query.message.reply_text(
            "Напиши инструкцию (например «сделай короче») или отправь готовый текст поста:"
        )

    elif data.startswith("skip:"):
        post_id = int(data.split(":")[1])
        post = await storage.get_post(post_id)
        await storage.update_post_status(post_id, "skipped")
        if post["plan_id"]:
            await storage.update_plan_status(post["plan_id"], "skipped")
        await query.message.edit_reply_markup(None)
        await query.message.reply_text("❌ Пропущено.")
        _state["pending_post_id"] = None


async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    text = update.message.text.strip()

    if _state["waiting_for"] == "plan_selection":
        topic_list = _state["pending_plan_topics"]
        if text.lower() == "все":
            ids = [t[0] for t in topic_list]
        else:
            try:
                nums = [int(n) - 1 for n in text.split()]
                ids = [topic_list[n][0] for n in nums if 0 <= n < len(topic_list)]
            except ValueError:
                await update.message.reply_text("Напиши номера через пробел (например: 1 3 5) или «все»")
                return

        await storage.approve_topics(ids)
        _state["waiting_for"] = None
        _state["pending_plan_topics"] = []
        await update.message.reply_text(f"✅ Одобрено {len(ids)} тем. Используй /next для генерации постов.")

    elif _state["waiting_for"] == "edit" and _state["pending_post_id"]:
        post_id = _state["pending_post_id"]
        post = await storage.get_post(post_id)

        # Heuristic: if short text looks like an instruction, regenerate
        is_instruction = len(text) < 200 and not text.startswith("http")
        if is_instruction:
            await update.message.reply_text("Перегенерирую с учётом правки...")
            topic_with_instruction = f"{post['title']} — {text}"
            try:
                content = await generator.generate_post_with_image(topic_with_instruction)
            except Exception as e:
                await update.message.reply_text(f"Ошибка генерации: {e}")
                return
            new_post_id = await storage.save_post(
                plan_id=post["plan_id"],
                title=content["title"],
                text=content["text"],
                hashtags=content["hashtags"],
                image_url=content["image_url"],
                image_path=content["image_path"],
            )
            new_post = await storage.get_post(new_post_id)
            _state["waiting_for"] = None
            await _send_post_for_approval(update.effective_chat.id, new_post, context)
        else:
            # Ready text from Svetlana — update and publish directly
            await storage.update_post_text(post_id, text)
            updated_post = await storage.get_post(post_id)
            try:
                await publisher.publish_post(
                    text=updated_post["text"],
                    hashtags=updated_post["hashtags"],
                    image_path=updated_post["image_path"],
                )
                await storage.update_post_status(post_id, "published")
                await update.message.reply_text("✅ Опубликовано с вашим текстом!")
            except Exception as e:
                await update.message.reply_text(f"Ошибка публикации: {e}")
            _state["waiting_for"] = None
            _state["pending_post_id"] = None


def build_app() -> Application:
    app = Application.builder().token(os.environ["BOT_TOKEN"]).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("plan", cmd_plan))
    app.add_handler(CommandHandler("next", cmd_next))
    app.add_handler(CommandHandler("post", cmd_post))
    app.add_handler(CallbackQueryHandler(callback_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))
    return app


async def main():
    await storage.init_db()
    app = build_app()
    print("Agent Produsser started.")
    await app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 4: Запустить тесты**

```
pytest tests/test_bot.py -v
```

Ожидаемый результат: 4 теста PASSED

- [ ] **Step 5: Коммит**

```
git add bot.py tests/test_bot.py
git commit -m "feat: approval bot with plan/next/post/status commands and ✅/✏️/❌ flow"
```

---

### Task 6: scheduler.py + финальный запуск

**Files:**
- Create: `c:/projects/content-agent/scheduler.py`
- Modify: `c:/projects/content-agent/bot.py` — вызвать `setup_scheduler` в `main()`

**Interfaces:**
- Consumes: `POST_TIME`, `TIMEZONE` из env; `build_app()` из bot.py
- Produces: `setup_scheduler(app: Application) -> AsyncIOScheduler`

- [ ] **Step 1: Написать scheduler.py**

```python
import os
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from telegram.ext import Application


def setup_scheduler(app: Application) -> AsyncIOScheduler:
    """Attach scheduled jobs to the running app. Call after app is initialized."""
    tz = os.getenv("TIMEZONE", "Europe/Minsk")
    post_time = os.getenv("POST_TIME", "09:00")
    hour, minute = map(int, post_time.split(":"))

    scheduler = AsyncIOScheduler(timezone=tz)

    # 1st of every month at 09:00 — trigger plan generation
    scheduler.add_job(
        _trigger_monthly_plan,
        CronTrigger(day=1, hour=9, minute=0, timezone=tz),
        args=[app],
        id="monthly_plan",
        replace_existing=True,
    )

    # Daily at POST_TIME — trigger next post generation
    scheduler.add_job(
        _trigger_daily_post,
        CronTrigger(hour=hour, minute=minute, timezone=tz),
        args=[app],
        id="daily_post",
        replace_existing=True,
    )

    return scheduler


async def _trigger_monthly_plan(app: Application):
    """Called by scheduler on 1st of month. Sends /plan trigger to bot logic."""
    import storage
    import planner

    admin_id = int(os.environ["ADMIN_CHAT_ID"])
    month = datetime.now().strftime("%Y-%m")

    try:
        topics = await planner.generate_monthly_plan(month)
        ids = await storage.save_plan_topics(topics, month)

        # Import here to avoid circular import
        from bot import _state
        _state["pending_plan_topics"] = list(zip(ids, [t["topic"] for t in topics]))
        _state["waiting_for"] = "plan_selection"

        lines = [f"{i+1}. {t['topic']}" for i, t in enumerate(topics)]
        text = f"📅 Автоплан на {month} готов. Выбери темы (номера через пробел) или «все»:\n\n" + "\n".join(lines)
        if len(text) > 4096:
            text = text[:4090] + "\n..."

        await app.bot.send_message(chat_id=admin_id, text=text)
    except Exception as e:
        await app.bot.send_message(chat_id=admin_id, text=f"Ошибка автоплана: {e}")


async def _trigger_daily_post(app: Application):
    """Called by scheduler daily. Generates and sends next queued post for approval."""
    import storage
    import generator

    admin_id = int(os.environ["ADMIN_CHAT_ID"])
    topic_row = await storage.get_next_queued_topic()

    if not topic_row:
        return  # Queue empty — nothing to do

    try:
        content = await generator.generate_post_with_image(topic_row["topic"])
        post_id = await storage.save_post(
            plan_id=topic_row["id"],
            title=content["title"],
            text=content["text"],
            hashtags=content["hashtags"],
            image_url=content["image_url"],
            image_path=content["image_path"],
        )
        await storage.update_plan_status(topic_row["id"], "generated")

        post = await storage.get_post(post_id)

        from bot import _state, _send_post_for_approval
        from telegram.ext import ContextTypes

        class _FakeContext:
            bot = app.bot

        await _send_post_for_approval(admin_id, post, _FakeContext())
    except Exception as e:
        await app.bot.send_message(chat_id=admin_id, text=f"Ошибка автогенерации поста: {e}")
```

- [ ] **Step 2: Обновить main() в bot.py — подключить scheduler**

Заменить функцию `main()` в `bot.py`:

```python
async def main():
    await storage.init_db()
    app = build_app()

    from scheduler import setup_scheduler
    scheduler = setup_scheduler(app)
    scheduler.start()

    print("Agent Produsser started.")
    try:
        await app.run_polling(drop_pending_updates=True)
    finally:
        scheduler.shutdown()
```

- [ ] **Step 3: Создать .env из .env.example**

```
copy c:/projects/content-agent/.env.example c:/projects/content-agent/.env
```

Заполнить реальными значениями:
- `BOT_TOKEN` — токен нового бота (получить у @BotFather, отдельный от Jarvis)
- `ANTHROPIC_API_KEY` — ключ Claude
- `OPENAI_API_KEY` — ключ OpenAI
- `CHANNEL_ID` — @username или -100xxx твоего Telegram-канала
- `ADMIN_CHAT_ID` — твой chat_id (узнать через @userinfobot)

- [ ] **Step 4: Запустить все тесты**

```
cd c:/projects/content-agent
pytest tests/ -v
```

Ожидаемый результат: все тесты PASSED (минимум 13 тестов)

- [ ] **Step 5: Проверить запуск бота**

```
cd c:/projects/content-agent
python bot.py
```

Ожидаемый результат: `Agent Produsser started.`
Написать `/start` в Telegram-бот — должно прийти приветственное сообщение.

- [ ] **Step 6: Финальный коммит**

```
git add scheduler.py bot.py
git commit -m "feat: APScheduler wired — monthly plan + daily post auto-triggers"
```

---

## Итоговая структура файлов

```
content-agent/
├── bot.py           ← точка входа: python bot.py
├── planner.py
├── generator.py
├── publisher.py
├── scheduler.py
├── storage.py
├── audience.md
├── requirements.txt
├── .env             ← не коммитить
├── .env.example
├── .gitignore
├── data.db          ← создаётся при запуске
├── images/
│   └── .gitkeep
├── tests/
│   ├── __init__.py
│   ├── test_storage.py
│   ├── test_planner.py
│   ├── test_generator.py
│   └── test_bot.py
└── docs/
    └── superpowers/
        ├── specs/2026-07-12-agent-produsser-design.md
        └── plans/2026-07-12-agent-produsser.md
```
