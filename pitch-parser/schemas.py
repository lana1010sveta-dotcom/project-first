from pydantic import BaseModel
from typing import Optional


class PitchData(BaseModel):
    file_name: str
    project_name: Optional[str] = None
    problem: Optional[str] = None
    solution: Optional[str] = None
    product: Optional[str] = None
    market: Optional[str] = None
    business_model: Optional[str] = None
    traction: Optional[str] = None
    team: Optional[str] = None
    competition: Optional[str] = None
    financials: Optional[str] = None
    ask_round: Optional[str] = None
    roadmap: Optional[str] = None
    stage: Optional[str] = None
    contacts: Optional[str] = None

    def to_row(self, timestamp: str) -> list:
        return [
            timestamp,
            self.file_name,
            self.project_name or "",
            self.problem or "",
            self.solution or "",
            self.product or "",
            self.market or "",
            self.business_model or "",
            self.traction or "",
            self.team or "",
            self.competition or "",
            self.financials or "",
            self.ask_round or "",
            self.roadmap or "",
            self.stage or "",
            self.contacts or "",
        ]


SHEET_HEADERS = [
    "Дата обработки",
    "Файл",
    "Название проекта",
    "Проблема",
    "Решение",
    "Продукт",
    "Рынок",
    "Бизнес-модель",
    "Тракшн",
    "Команда",
    "Конкуренты",
    "Финансы",
    "Инвест-запрос / Раунд",
    "Дорожная карта",
    "Стадия",
    "Контакты",
]
