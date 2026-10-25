# Self-hosting (VPS, Docker)

The site runs on the VPS from `docker-compose.yml` (site + Postgres +
RustFS for uploads), checked out at `/root/kvitkovyi/kvitkovyi-web`.

- **Secrets**: `.env` next to `docker-compose.yml` (never committed) — the
  app's usual vars plus `POSTGRES_PASSWORD`, `STORAGE_ACCESS_KEY`,
  `STORAGE_SECRET_KEY`. Values that differ on the VPS (DB, storage, site
  URL) are set in `docker-compose.yml` itself.
- **Auto-deploy**: `deploy/deploy.sh`, run every 2 minutes by
  `kvitkovyi-deploy.timer` — pulls `origin/main`, rebuilds, restarts.
  Force a rebuild: `deploy/deploy.sh force`. Log:
  `journalctl -u kvitkovyi-deploy -n 50`.
- **Cron**: `deploy/kvitkovyi.cron` → `/etc/cron.d/kvitkovyi`.
- **Public access**: the stack's own Cloudflare tunnel — the `tunnel`
  service. Never the machine's other cloudflared (`/etc/cloudflared`, another
  site's): create a tunnel in the Cloudflare dashboard (Zero Trust → Networks
  → Tunnels → Cloudflared), add public hostnames `kvitkovyi.pp.ua` →
  `http://web:3000` and `storage.kvitkovyi.pp.ua` → `http://storage:9000`, then
  put its token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN=…` plus
  `COMPOSE_PROFILES=tunnel`, and `docker compose up -d`. The bucket
  `kvitkovyi` is public-read.

Install on a fresh checkout:

```sh
ln -sf /root/kvitkovyi/kvitkovyi-web/deploy/kvitkovyi-deploy.service /etc/systemd/system/
ln -sf /root/kvitkovyi/kvitkovyi-web/deploy/kvitkovyi-deploy.timer /etc/systemd/system/
cp deploy/kvitkovyi.cron /etc/cron.d/kvitkovyi
systemctl daemon-reload && systemctl enable --now kvitkovyi-deploy.timer
```
