import base64
from pathlib import Path

import fitz  # PyMuPDF

from config import MAX_PAGES, PDF_DPI


def pdf_to_base64_images(pdf_path: str | Path) -> list[str]:
    """Render each PDF page as a PNG and return list of base64-encoded strings."""
    images = []
    doc = fitz.open(str(pdf_path))
    total_pages = min(len(doc), MAX_PAGES)
    # fitz default is 72 DPI; scale factor brings it to PDF_DPI
    mat = fitz.Matrix(PDF_DPI / 72, PDF_DPI / 72)

    for i in range(total_pages):
        pix = doc[i].get_pixmap(matrix=mat)
        b64 = base64.b64encode(pix.tobytes("jpeg", jpg_quality=82)).decode("utf-8")
        images.append(b64)

    doc.close()
    return images
