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
