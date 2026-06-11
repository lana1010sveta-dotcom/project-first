import tempfile
from pathlib import Path

import streamlit as st

st.set_page_config(page_title="Pitch Deck Parser", page_icon="📊", layout="wide")

st.title("📊 Pitch Deck Parser")
st.caption("Загрузите PDF питч-деки — приложение извлечёт ключевую информацию и отправит в Google Sheets.")

# ── Sidebar settings ──────────────────────────────────────────────────────────
with st.sidebar:
    st.header("⚙️ Настройки")

    api_key = st.text_input(
        "OpenRouter API Key",
        type="password",
        placeholder="sk-or-v1-...",
        help="Получить на openrouter.ai/keys",
    )

    spreadsheet_url = st.text_input(
        "Google Sheets URL",
        placeholder="https://docs.google.com/spreadsheets/d/...",
    )

    sheet_name = st.text_input("Название листа", value="Питчи")

    credentials_file = st.file_uploader(
        "Google credentials.json",
        type="json",
        help="Сервис-аккаунт из Google Cloud Console",
    )

    st.divider()
    st.markdown("**Извлекаемые блоки:**")
    for block in [
        "Название проекта", "Проблема", "Решение", "Продукт",
        "Рынок (TAM/SAM/SOM)", "Бизнес-модель", "Тракшн",
        "Команда", "Конкуренты", "Финансы",
        "Инвест-запрос / Раунд", "Дорожная карта", "Стадия", "Контакты",
    ]:
        st.markdown(f"• {block}")

# ── Main area ─────────────────────────────────────────────────────────────────
uploaded_files = st.file_uploader(
    "Загрузите PDF файлы",
    type="pdf",
    accept_multiple_files=True,
    label_visibility="collapsed",
)

if uploaded_files:
    st.markdown(f"**{len(uploaded_files)} файл(ов) выбрано:**")
    for f in uploaded_files:
        size_mb = f.size / 1024 / 1024
        st.markdown(f"📄 {f.name} &nbsp; `{size_mb:.1f} MB`")

st.divider()

parse_btn = st.button("🚀 Парсить питч-деки", type="primary", use_container_width=True)

if parse_btn:
    # Validate inputs
    errors = []
    if not api_key:
        errors.append("Укажите OpenRouter API Key")
    if not spreadsheet_url:
        errors.append("Укажите ссылку на Google Таблицу")
    if not credentials_file:
        errors.append("Загрузите credentials.json")
    if not uploaded_files:
        errors.append("Загрузите хотя бы один PDF")

    if errors:
        for e in errors:
            st.error(e)
        st.stop()

    # Extract spreadsheet ID from URL
    import re
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", spreadsheet_url)
    if not match:
        st.error("Не удалось извлечь ID таблицы из URL. Проверьте ссылку.")
        st.stop()
    spreadsheet_id = match.group(1)

    # Save credentials to temp file
    import json, os
    creds_data = json.load(credentials_file)
    creds_tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    json.dump(creds_data, creds_tmp)
    creds_tmp.close()

    # Override env for this session
    os.environ["OPENROUTER_API_KEY"] = api_key
    os.environ["SPREADSHEET_ID"] = spreadsheet_id
    os.environ["SHEET_NAME"] = sheet_name
    os.environ["GOOGLE_CREDENTIALS_FILE"] = creds_tmp.name

    from pdf_to_images import pdf_to_base64_images
    from llm_extractor import extract_pitch_data
    from sheets_writer import write_pitch

    results = []
    progress = st.progress(0, text="Начинаем...")
    status_box = st.empty()

    for idx, uploaded in enumerate(uploaded_files):
        name = uploaded.name
        status_box.info(f"Обрабатываю: **{name}**")

        try:
            # Save PDF to temp file
            pdf_tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
            pdf_tmp.write(uploaded.read())
            pdf_tmp.close()

            with st.status(f"📄 {name}", expanded=True) as s:
                st.write("Конвертирую страницы в изображения...")
                images = pdf_to_base64_images(pdf_tmp.name)
                st.write(f"Страниц: {len(images)}")

                st.write("Отправляю в Gemini Vision...")
                pitch = extract_pitch_data(images, name)
                st.write(f"Извлечено: **{pitch.project_name or 'без названия'}**")

                st.write("Записываю в Google Sheets...")
                write_pitch(pitch)
                s.update(label=f"✅ {name} — готово", state="complete")

            results.append({"name": name, "pitch": pitch, "ok": True})

        except Exception as e:
            st.error(f"Ошибка в {name}: {e}")
            results.append({"name": name, "error": str(e), "ok": False})
        finally:
            os.unlink(pdf_tmp.name)

        progress.progress((idx + 1) / len(uploaded_files), text=f"{idx+1}/{len(uploaded_files)}")

    os.unlink(creds_tmp.name)
    status_box.empty()

    # Summary
    ok_count = sum(1 for r in results if r["ok"])
    st.success(f"Готово! Обработано {ok_count}/{len(results)} файлов.")

    # Show extracted data
    if ok_count:
        st.subheader("Извлечённые данные")
        for r in results:
            if not r["ok"]:
                continue
            p = r["pitch"]
            with st.expander(f"📄 {p.project_name or r['name']}"):
                cols = st.columns(2)
                fields = [
                    ("Проблема", p.problem), ("Решение", p.solution),
                    ("Продукт", p.product), ("Рынок", p.market),
                    ("Бизнес-модель", p.business_model), ("Тракшн", p.traction),
                    ("Команда", p.team), ("Конкуренты", p.competition),
                    ("Финансы", p.financials), ("Инвест-запрос", p.ask_round),
                    ("Дорожная карта", p.roadmap), ("Стадия", p.stage),
                    ("Контакты", p.contacts),
                ]
                for i, (label, value) in enumerate(fields):
                    with cols[i % 2]:
                        st.markdown(f"**{label}**")
                        st.caption(value or "—")
