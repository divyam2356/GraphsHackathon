# Black Box on Modal (D1, ROADMAP.md): one warm container runs FalkorDB + the app.
# - The graph ships in the RDB (`deploy/dump.rdb` -> Modal Volume). No data download,
#   no ingest at boot: redis-server loads the dump from --dir /data (63.7 MB, seconds).
# - The API tolerates a missing .env ("explicit env wins"), so we set only FALKORDB_URL and
#   FALKORDB_GRAPH. No OPENROUTER_API_KEY -> the Live model mode is off on the public site
#   (what D1 says: the recorded/scripted runs from the same URL are the demo).
# - Warm (min_containers=1) at 1 CPU core + 2 GiB: about $1.5 a day (~$8 through Oct 23),
#   inside the free $30/month credit. To sleep instead, remove `min_containers=1` (a first
#   visit then waits for the container and the Redis load, about 10-20 s).
# Setup steps: see deploy/README.md (token, volume, deploy). Any working directory works:
# the repo root is found from this file.
import subprocess
import time
import urllib.request
from pathlib import Path

import modal

app = modal.App("blackbox")

GRAPH_VOLUME = modal.Volume.from_name("blackbox-graph", create_if_missing=True)  # holds dump.rdb at its root
REPO = Path(__file__).resolve().parents[1]  # deploy/.. ; only read on the machine that deploys

image = (
    # the same FalkorDB release every README number was measured on (v4.14.6)
    modal.Image.from_registry("falkordb/falkordb:v4.14.6", add_python="3.12")
    .run_commands(
        "apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl",
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y --no-install-recommends nodejs",
    )
    # repo source only: no .env (no key on the public site), no data/ (700 MB - the graph
    # is preloaded in the volume), no node_modules/.next (installed and built inside Modal).
    # copy=True: Modal only allows build steps (npm ci, next build) after copied files.
    .add_local_dir(
        REPO,
        remote_path="/repo",
        copy=True,
        ignore=[".git", "node_modules", "**/node_modules", "data", ".next", "**/.next", ".env", "deploy/dump.rdb"],
    )
    .run_commands("cd /repo && npm ci", "cd /repo/apps/web && npm run build")
)


@app.function(
    image=image,
    volumes={"/data": GRAPH_VOLUME},
    env={"FALKORDB_URL": "redis://127.0.0.1:6379", "FALKORDB_GRAPH": "blackbox"},
    # FalkorDB holds ~390 MB with the graph loaded (docker stats, Oct 18) + next start:
    # (request, limit) pairs, billed on the request when idle
    memory=(2048, 4096),
    cpu=(1.0, 4.0),
    min_containers=1,  # warm; remove to sleep when idle
    timeout=900,
)
@modal.web_server(3001, startup_timeout=600)
def serve():
    # the image's own launch line (var/lib/falkordb/bin/run.sh), minus TLS and the browser UI
    subprocess.Popen([
        "redis-server", "--protected-mode", "no", "--dir", "/data",
        "--loadmodule", "/var/lib/falkordb/bin/falkordb.so",
        "THREAD_COUNT", "2", "TIMEOUT", "1000", "MAX_QUEUED_QUERIES", "25", "RESULTSET_SIZE", "10000",
        "--save", "60", "100",  # periodic RDB so visitor-written WorkOrders/Alerts survive restarts
    ])

    # PING answers "Connection refused" until Redis listens and "LOADING" while it reads
    # the dump; only PONG means the graph is ready
    for _ in range(240):
        try:
            out = subprocess.run(["redis-cli", "ping"], capture_output=True, text=True, timeout=10)
            if out.stdout.strip() == "PONG":
                break
        except subprocess.TimeoutExpired:
            pass
        time.sleep(1)
    else:
        raise RuntimeError("FalkorDB did not come up in 240 s (check the volume has dump.rdb at its root)")

    subprocess.Popen(["npx", "next", "start", "-p", "3001"], cwd="/repo/apps/web")
    for _ in range(120):
        try:
            with urllib.request.urlopen("http://127.0.0.1:3001/", timeout=2) as resp:
                if resp.status == 200:
                    return  # Modal keeps the container and proxies the request through
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError("the web app did not answer on 3001")
