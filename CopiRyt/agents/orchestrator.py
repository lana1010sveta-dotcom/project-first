"""Оркестратор — запускает пайплайны агентов, шлёт прогресс в бот."""
from typing import Callable, Awaitable, Optional

import config
from agents.researcher import Researcher
from agents.architect import Architect
from agents.copywriter import Copywriter
from agents.editor import Editor
from agents.critic import Critic
from agents.tester import Tester
from agents.style_analyst import StyleAnalyst
from agents.content_planner import ContentPlanner
from agents.decomposer import Decomposer

ProgressCb = Optional[Callable[[str], Awaitable[None]]]


class Orchestrator:
    def __init__(self):
        self.researcher      = Researcher()
        self.architect       = Architect(config.TONE_OF_VOICE)
        self.copywriter      = Copywriter(config.TONE_OF_VOICE)
        self.editor          = Editor()
        self.critic          = Critic()
        self.tester          = Tester()
        self.style_analyst   = StyleAnalyst()
        self.content_planner = ContentPlanner(config.CONTENT_PLAN_TEXT, config.AUDIENCE)
        self.decomposer      = Decomposer()

    async def _notify(self, cb: ProgressCb, text: str) -> None:
        if cb:
            try:
                await cb(text)
            except Exception:
                pass

    # ------------------------------------------------------------------ #
    #  Пайплайн: написать новый пост                                       #
    # ------------------------------------------------------------------ #
    async def write_post(
        self,
        topic: str,
        post_type: str,
        details: str = "",
        on_progress: ProgressCb = None,
    ) -> tuple[str, str]:
        """
        Возвращает (текст поста, разбор критика).
        """
        await self._notify(on_progress, "🔍 Ресёрчер ищет данные по теме…")
        research = await self.researcher.run(
            f"Тема: {topic}\nТип поста: {post_type}\nДоп. детали: {details}"
        )

        await self._notify(on_progress, "🏗 Архитектор строит каркас поста…")
        structure = await self.architect.run(
            f"Тема: {topic}\nТип: {post_type}\n\nДанные от ресёрчера:\n{research}"
            f"\n\nДополнительно: {details}"
        )

        await self._notify(on_progress, "✍️ Копирайтер пишет черновик…")
        post = await self.copywriter.run(
            f"Каркас поста:\n{structure}\n\nДанные ресёрчера:\n{research}"
        )

        await self._notify(on_progress, "⚡ Редактор заостряет текст…")
        edited_raw = await self.editor.run(f"Запрос: хлёстче\n\nПост:\n{post}")
        post = self.editor.extract_post(edited_raw)

        await self._notify(on_progress, "🎯 Критик оценивает…")
        critique = await self.critic.run(post)

        passed, test_result = await self.tester.check(post)
        if not passed:
            await self._notify(on_progress, "🔧 Тестировщик нашёл замечания, исправляю…")
            fix_raw = await self.editor.run(
                f"Запрос: исправь следующие замечания:\n{test_result}\n\nПост:\n{post}"
            )
            post = self.editor.extract_post(fix_raw)

        return post, critique

    # ------------------------------------------------------------------ #
    #  Пайплайн: отредактировать готовый пост                             #
    # ------------------------------------------------------------------ #
    async def edit_post(
        self,
        post: str,
        request: str,
        on_progress: ProgressCb = None,
    ) -> tuple[str, str, str]:
        """
        Возвращает (отредактированный пост, что изменил, разбор критика).
        """
        await self._notify(on_progress, f"✏️ Редактор делает «{request}»…")
        result = await self.editor.run(f"Запрос: {request}\n\nПост:\n{post}")
        post_out = self.editor.extract_post(result)
        changes  = self.editor.extract_changes(result)

        await self._notify(on_progress, "🎯 Критик сравнивает до/после…")
        critique = await self.critic.run(post_out)

        return post_out, changes, critique

    # ------------------------------------------------------------------ #
    #  Пайплайн: разобрать стиль поста                                    #
    # ------------------------------------------------------------------ #
    async def analyze(
        self,
        post: str,
        on_progress: ProgressCb = None,
    ) -> tuple[str, str]:
        """
        Возвращает (анализ стиля, оценка критика).
        """
        await self._notify(on_progress, "🔬 Аналитик стиля изучает текст…")
        analysis = await self.style_analyst.run(post)

        await self._notify(on_progress, "🎯 Критик выставляет оценку…")
        critique = await self.critic.run(post)

        return analysis, critique

    # ------------------------------------------------------------------ #
    #  Контент-план                                                        #
    # ------------------------------------------------------------------ #
    async def get_next_topic(self) -> str:
        return await self.content_planner.run(
            "Выдай следующую тему из плана. Одна строка: тема и тип поста."
        )

    async def show_plan(self) -> str:
        return await self.content_planner.run(
            "Покажи текущий контент-план в виде краткой таблицы: # | Тема | Тип | Статус."
        )

    async def decompose(self, task: str) -> str:
        return await self.decomposer.run(task)
