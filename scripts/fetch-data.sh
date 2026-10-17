#!/usr/bin/env bash
# Downloads the public raw data into data/raw/ (gitignored, ~700 MB):
#   data/raw/ntsb/  NTSB aviation accident database (avall.mdb -> 4 CSV tables)
#   data/raw/sdr/   FAA Service Difficulty Reports, one CSV per year 2008..current
#   data/raw/docs/  the two S-4L airworthiness directives (govinfo HTML) and the
#                   NTSB Southwest 812 brief AAB-13/02 (PDF -> text via pypdf)
# Needs curl, unzip and uv (for the mdb reader and the PDF text). Re-running skips files already present.
# Usage: scripts/fetch-data.sh [first_year]
set -euo pipefail
cd "$(dirname "$0")/.."
FIRST=${1:-2008}
UA="Mozilla/5.0"
mkdir -p data/raw/ntsb data/raw/sdr data/raw/docs

if [ ! -f data/raw/ntsb/events.csv ]; then
  echo "NTSB avall.zip ..."
  curl -sSL --max-time 900 -A "$UA" -o data/raw/ntsb/avall.zip \
    "https://data.ntsb.gov/avdata/FileDirectory/DownloadFile?fileID=C%3A%5Cavdata%5Cavall.zip"
  unzip -o -q data/raw/ntsb/avall.zip -d data/raw/ntsb
  uv run --no-project --with access-parser python -I scripts/dump_ntsb.py data/raw/ntsb/avall.mdb data/raw/ntsb
fi

for y in $(seq "$FIRST" "$(date +%Y)"); do
  f="data/raw/sdr/SDR-$y.csv"
  [ -s "$f" ] && continue
  echo "FAA SDR $y ..."
  curl -sSL --max-time 900 -A "$UA" -o "$f" "https://external.apic4e.faa.gov/sdrs/retrieve/SDR-$y.csv"
done

# Documents (US government works, public domain): saved as fetched; the two ADs as the
# govinfo HTML of their Federal Register pages, the NTSB brief as PDF + extracted text.
doc() { # doc <url> <file>
  [ -s "data/raw/docs/$2" ] && return
  echo "doc $2 ..."
  curl -sSL --max-time 600 -A "$UA" -o "data/raw/docs/$2" "$1"
}
doc "https://www.govinfo.gov/content/pkg/FR-2011-05-18/html/2011-11928.htm" "AD-2011-08-51.htm"
doc "https://www.govinfo.gov/content/pkg/FR-2015-08-25/html/2015-20372.htm" "AD-2015-16-08.htm"
doc "https://www.ntsb.gov/investigations/AccidentReports/Reports/AAB1302.pdf" "NTSB-AAB-13-02.pdf"
if [ -s data/raw/docs/NTSB-AAB-13-02.pdf ] && [ ! -s data/raw/docs/NTSB-AAB-13-02.txt ]; then
  echo "NTSB brief text ..."
  uv run --no-project --with pdfminer.six python -I scripts/extract_pdf.py \
    data/raw/docs/NTSB-AAB-13-02.pdf data/raw/docs/NTSB-AAB-13-02.txt
fi
echo "done: $(ls data/raw/sdr | wc -l) SDR files, docs: $(ls data/raw/docs | tr '\n' ' ')"
