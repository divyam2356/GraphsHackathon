"""Dump the four NTSB tables the ingest uses from avall.mdb to CSV.

Usage (no mdbtools needed): uv run --no-project --with access-parser python -I scripts/dump_ntsb.py <avall.mdb> <out_dir>
Called by scripts/fetch-data.sh; services/ingest/src/ntsb.ts reads the output.
"""
import csv
import sys
from pathlib import Path

from access_parser import AccessParser

TABLES = ["events", "aircraft", "Findings", "narratives"]


def main(mdb: str, out: str) -> None:
    db = AccessParser(mdb)
    for name in TABLES:
        t = db.parse_table(name)
        cols = list(t.keys())
        rows = len(t[cols[0]]) if cols else 0
        with open(Path(out) / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for i in range(rows):
                w.writerow([t[c][i] for c in cols])
        print(f"{name}: {rows} rows")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
