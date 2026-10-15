#!/usr/bin/env bash
# Downloads the public raw data into data/raw/ (gitignored, ~700 MB):
#   data/raw/ntsb/  NTSB aviation accident database (avall.mdb -> 4 CSV tables)
#   data/raw/sdr/   FAA Service Difficulty Reports, one CSV per year 2008..current
# Needs curl, unzip and uv (for the mdb reader). Re-running skips files already present.
# Usage: scripts/fetch-data.sh [first_year]
set -euo pipefail
cd "$(dirname "$0")/.."
FIRST=${1:-2008}
UA="Mozilla/5.0"
mkdir -p data/raw/ntsb data/raw/sdr

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
echo "done: $(ls data/raw/sdr | wc -l) SDR files, NTSB tables in data/raw/ntsb"
