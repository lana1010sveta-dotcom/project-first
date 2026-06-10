from datetime import datetime

import gspread
from google.oauth2.service_account import Credentials

from config import GOOGLE_CREDENTIALS_FILE, SHEET_NAME, SPREADSHEET_ID
from schemas import SHEET_HEADERS, PitchData

_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def _get_sheet() -> gspread.Worksheet:
    creds = Credentials.from_service_account_file(GOOGLE_CREDENTIALS_FILE, scopes=_SCOPES)
    gc = gspread.authorize(creds)
    spreadsheet = gc.open_by_key(SPREADSHEET_ID)

    try:
        sheet = spreadsheet.worksheet(SHEET_NAME)
    except gspread.WorksheetNotFound:
        sheet = spreadsheet.add_worksheet(title=SHEET_NAME, rows=1000, cols=20)

    # Write headers if the first row is empty or wrong
    first_row = sheet.row_values(1)
    if first_row != SHEET_HEADERS:
        if first_row:
            sheet.insert_row(SHEET_HEADERS, 1)
        else:
            sheet.append_row(SHEET_HEADERS, value_input_option="USER_ENTERED")

    return sheet


def write_pitch(pitch: PitchData) -> None:
    sheet = _get_sheet()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    sheet.append_row(pitch.to_row(timestamp), value_input_option="USER_ENTERED")
