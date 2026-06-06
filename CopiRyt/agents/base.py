"""Базовый класс агента. Все агенты наследуют отсюда."""
from openai import AsyncOpenAI
import config

_client = AsyncOpenAI(
    api_key=config.OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1",
)

_HEADERS = {
    "HTTP-Referer": "https://copiryt.app",
    "X-Title": "CopiRyt",
}


class Agent:
    model: str
    temperature: float
    system_prompt: str

    async def run(self, message: str) -> str:
        response = await _client.chat.completions.create(
            model=self.model,
            temperature=self.temperature,
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user",   "content": message},
            ],
            extra_headers=_HEADERS,
        )
        return response.choices[0].message.content or ""
