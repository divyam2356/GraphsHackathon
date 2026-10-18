# Modal deployment (D1) — how to run it

The deploy is assigned to divyam2356 (ROADMAP.md **D1**, by Oct 18, 15:00). Everything is prepared
here; what is left is one browser login, then three commands.

## One-time setup (needs a Modal account — the free $30/month credit, no card)

```powershell
uv tool install modal            # the CLI (uv is already installed)
& "$env:USERPROFILE\.local\bin\modal.exe" token new   # opens the browser to authenticate
```

## Load the graph into a Modal volume (the RDB from the local container)

`deploy/dump.rdb` is the graph as it runs today (63.7 MB — it carries every Report, the
documents from Track 3, the org, all of it). Refresh it any time by re-running the same two
commands (`redis-cli SAVE`, `docker cp`) before `volume put`.

```powershell
& "$env:USERPROFILE\.local\bin\modal.exe" volume create blackbox-graph
& "$env:USERPROFILE\.local\bin\modal.exe" volume put blackbox-graph dump.rdb /dump.rdb   # mounted at /rdb in the container
```

## Deploy

```powershell
& "$env:USERPROFILE\.local\bin\modal.exe" deploy modal_app.py
```

The first deploy builds the image (npm ci + next build, ~5 min), then the container starts,
Redis loads the graph, and Modal prints the public URL (`https://<workspace>--blackbox-serve.modal.run`,
check with `modal app list`). Open it in a private window (the Phase-2 checklist line).

## What it is

- One warm container (`min_containers=1`): `redis-server` (FalkorDB v4.14.6, the same launch
  flags as `docker-compose.yml`) + `next start`, 1 CPU core + 2 GiB: about $1.5 a day (~$8
  through Oct 23) on the free credit.
  Remove `min_containers=1` in `modal_app.py` to sleep-when-idle (visits wait 10–20 s).
- Secrets: the image never contains `.env`. The OpenRouter key lives in Modal's secret store
  (`modal secret create blackbox-openrouter LLM_API_KEY=<your-key>`) and is injected at runtime
  (the `secrets=[...]` line in `modal_app.py`), so Live model mode works on the public site.
  Note: `openrouter/free` models cap at about 50 requests/day — the Recorded/Scripted/Watch
  flows never call the API. To turn Live mode off publicly, delete the secret.
  The key value is not in git or the image either way.
- `dump.rdb` is gitignored (it is the data, not source).

## Notes

- Visitor-written records (WorkOrders, Alerts, investigations) persist via the periodic RDB
  save; to reset the graph, re-put a fresh dump (the two commands at the top).
- Refresh the dump after landing new work (e.g. re-put after the video is recorded), since the
  recorded demo steps replay against whatever the graph holds.
- If `add_local_dir`'s `ignore` patterns trip over a Modal version change, the fallback is
  `Image.from_dockerfile_str(...)` with the same commands — keep the launch line unchanged.
