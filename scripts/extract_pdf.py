# Dump a PDF's text with pdfminer (uv run --no-project --with pdfminer.six python -I scripts/extract_pdf.py <in.pdf> <out.txt>)
import re
import sys
from pdfminer.high_level import extract_text

t = extract_text(sys.argv[1])
t = re.sub(r"[ \t]+", " ", t)  # pdfminer doubles spaces; single spacing keeps it verbatim
open(sys.argv[2], "w", encoding="utf-8").write(t.strip() + "\n")
