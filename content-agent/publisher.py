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
