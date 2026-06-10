#!/usr/bin/env python3
"""
Pitch Deck Parser — reads PDF pitch decks as images and writes to Google Sheets.

Usage:
  python parse.py                    # process ./pitches/ folder
  python parse.py path/to/deck.pdf   # single file
  python parse.py ./folder/          # specific folder
  python parse.py deck.pdf --dry-run # extract only, skip Sheets write
"""
import argparse
import sys
from pathlib import Path

from llm_extractor import extract_pitch_data
from pdf_to_images import pdf_to_base64_images
from sheets_writer import write_pitch


def process_pdf(pdf_path: Path, dry_run: bool = False) -> bool:
    print(f"\n  {pdf_path.name}")
    try:
        print(f"    converting pages...", end=" ", flush=True)
        images = pdf_to_base64_images(pdf_path)
        print(f"{len(images)} pages")

        print(f"    extracting via LLM...", end=" ", flush=True)
        pitch = extract_pitch_data(images, pdf_path.name)
        print(f"done  [{pitch.project_name or 'no name found'}]")

        if dry_run:
            print(f"    [dry-run] skipping Sheets write")
            for field, val in pitch.model_dump().items():
                if field != "file_name" and val:
                    print(f"      {field}: {val[:120]}")
        else:
            print(f"    writing to Google Sheets...", end=" ", flush=True)
            write_pitch(pitch)
            print("done")

        return True

    except Exception as exc:
        print(f"\n    ERROR: {exc}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse pitch deck PDFs and write structured data to Google Sheets"
    )
    parser.add_argument(
        "path",
        nargs="?",
        default="./pitches",
        help="PDF file or folder with PDFs (default: ./pitches)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Extract data but do not write to Google Sheets",
    )
    args = parser.parse_args()

    target = Path(args.path)

    if target.is_file() and target.suffix.lower() == ".pdf":
        pdfs = [target]
    elif target.is_dir():
        pdfs = sorted(target.glob("*.pdf"))
    else:
        print(f"Error: '{target}' is not a PDF file or a directory.")
        sys.exit(1)

    if not pdfs:
        print(f"No PDF files found in '{target}'.")
        sys.exit(0)

    print(f"Found {len(pdfs)} PDF file(s)  [dry-run={args.dry_run}]")

    ok = sum(process_pdf(p, dry_run=args.dry_run) for p in pdfs)
    print(f"\nResult: {ok}/{len(pdfs)} processed successfully.")

    if ok < len(pdfs):
        sys.exit(1)


if __name__ == "__main__":
    main()
