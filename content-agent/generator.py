import os
import httpx
from pathlib import Path
from openai import AsyncOpenAI

openrouter_client = AsyncOpenAI(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api/v1",
)
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

    response = await openrouter_client.chat.completions.create(
        model="anthropic/claude-sonnet-4-5",
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

    raw = response.choices[0].message.content.strip()
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
    try:
        image_url, image_path = await generate_image(topic, post["title"])
    except Exception:
        image_url, image_path = "", ""
    return {**post, "image_url": image_url, "image_path": image_path}
