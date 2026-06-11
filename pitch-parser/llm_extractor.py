import json
import re

from openai import OpenAI

from config import MODEL, OPENROUTER_API_KEY, OPENROUTER_BASE_URL
from schemas import PitchData

SYSTEM_PROMPT = """You are an expert investment analyst reviewing pitch deck slides.

Analyze ALL provided slides and extract structured information into a JSON object.
Use null for any field not found in the pitch.
Keep values concise but complete. Preserve the original language (Russian or English) of each field.

Return ONLY valid JSON, no markdown fences, no extra text:

{
  "project_name": "Company or product name",
  "problem": "The problem being solved",
  "solution": "The proposed solution",
  "product": "What the product/service is and how it works",
  "market": "Market size — TAM/SAM/SOM, target audience, geography",
  "business_model": "How the company monetizes (pricing, revenue streams)",
  "traction": "Key metrics: MAU/DAU, revenue, customers, growth rate, deals",
  "team": "Founders and key team members with roles and backgrounds",
  "competition": "Competitors listed and competitive advantages / positioning",
  "financials": "Financial projections, unit economics, burn rate, P&L highlights",
  "ask_round": "Investment ask: amount, round stage (pre-seed/seed/A), use of funds",
  "roadmap": "Development milestones, planned features, timeline",
  "stage": "Current project stage: idea / MVP / pre-seed / seed / Series A / growth",
  "contacts": "Founder name, email, phone, website, social links"
}"""


def extract_pitch_data(images: list[str], file_name: str) -> PitchData:
    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=OPENROUTER_API_KEY,
    )

    content: list[dict] = [
        {"type": "text", "text": "Analyze this pitch deck and extract all structured information:"}
    ]
    for b64 in images:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
        })

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        max_tokens=2048,
        temperature=0.1,
    )

    raw = response.choices[0].message.content.strip()
    # Strip markdown code fences if model adds them despite instructions
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    data = json.loads(raw)
    return PitchData(file_name=file_name, **{k: v for k, v in data.items() if v is not None})
