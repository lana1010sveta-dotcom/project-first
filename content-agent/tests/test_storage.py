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
