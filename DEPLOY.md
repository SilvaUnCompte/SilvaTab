# Deploying Silva's Tab (Debian + nginx)

Target: `https://tab.example.com` → nginx (TLS) → `127.0.0.1:3000` (app container) → `mongo` (internal Docker network only).

Replace `tab.example.com`, `user@server` and paths with your own values.

```mermaid
flowchart LR
  C[Browser / Claude] -->|HTTPS 443| N[nginx]
  N -->|http 127.0.0.1:3000| A[app container]
  A -->|docker network| M[(mongo container)]
```

## 0. Prerequisites

- A DNS `A`/`AAAA` record for `tab.example.com` pointing to the server.
- Ports 80 and 443 open. If you use `ufw`: `sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full'`.
- MongoDB 5+ needs AVX: `grep -m1 -o avx /proc/cpuinfo` must print `avx`. Otherwise use `image: mongo:4.4` in `docker-compose.yml`.

## 1. Install Docker (official repository)

Debian's own packages ship an outdated Compose (bookworm) or lag behind; the official repo gives the current `docker compose` plugin.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Enable log rotation (Docker's default `json-file` driver never rotates):

```bash
echo '{ "log-driver": "local" }' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

## 2. Get the code

```bash
sudo apt-get install -y git
sudo git clone https://github.com/SilvaUnCompte/SilvaTab.git /opt/silvatab
```

`.env` is git-ignored, so updates never touch the server's secrets.

## 3. Configure secrets

```bash
cd /opt/silvatab
sudo cp .env.example .env
sudo sed -i "s/^MCP_TOKEN=.*/MCP_TOKEN=$(openssl rand -hex 32)/" .env
sudo nano .env        # set SILVA_PASSWORD, keep BIND_ADDRESS=127.0.0.1
sudo chmod 600 .env
```

`BIND_ADDRESS=127.0.0.1` matters: Docker writes its own iptables rules and **bypasses ufw**, so a port published on `0.0.0.0` would be reachable from the internet in plain HTTP, skipping nginx.

## 4. Start

```bash
cd /opt/silvatab
sudo docker compose up -d --build
sudo docker compose ps                 # both services "healthy"
curl -s http://127.0.0.1:3000/healthz  # {"ok":true}
```

Containers restart automatically on reboot (`restart: unless-stopped` + Docker enabled by systemd).

## 5. nginx

`/etc/nginx/sites-available/silvatab`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name tab.example.com;

    # The app accepts bodies up to 5 MB (nginx default is 1 MB)
    client_max_body_size 5m;

    # Inherited by every location below (none of them redefines proxy_set_header)
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Overwrite instead of append: the app trusts this header, so a client-supplied
    # value would let anyone bypass the login rate limit.
    proxy_set_header X-Forwarded-For $remote_addr;

    location / {
        proxy_pass http://127.0.0.1:3000;
    }

    location /mcp {
        # The claude.ai connector sends the token in the query string: keep it out of the logs
        access_log off;
        proxy_read_timeout 300s;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/silvatab /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`X-Forwarded-Proto` is what makes the session cookie `Secure` once HTTPS is on.

## 6. HTTPS (Let's Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tab.example.com --redirect
```

Certbot adds the 443 block and the HTTP→HTTPS redirect to the file above, and installs a renewal timer (`systemctl list-timers | grep certbot`).

## 7. Smoke tests

```bash
# UI
curl -sI https://tab.example.com | head -1                        # HTTP/2 200

# MCP without token -> 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://tab.example.com/mcp

# OAuth discovery must be a 404, otherwise Claude's connector fails on "Connect"
curl -s -o /dev/null -w '%{http_code}\n' https://tab.example.com/.well-known/oauth-protected-resource/mcp

# MCP with token -> JSON with "serverInfo"
TOKEN=$(sudo grep ^MCP_TOKEN= /opt/silvatab/.env | cut -d= -f2)
curl -s https://tab.example.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

Then plug Claude in as described in the README (`https://tab.example.com/mcp`).

## 8. Backups

`/etc/cron.daily/silvatab-backup` (no dot in the name, or `run-parts` skips it):

```sh
#!/bin/sh
set -eu
dir=/var/backups/silvatab
mkdir -p "$dir"
cd /opt/silvatab
docker compose exec -T mongo mongodump --archive --gzip --db silvas-tab > "$dir/.partial"
mv "$dir/.partial" "$dir/silvatab-$(date +%F).archive.gz"
find "$dir" -name 'silvatab-*.archive.gz' -mtime +14 -delete
```

```bash
sudo chmod +x /etc/cron.daily/silvatab-backup
sudo /etc/cron.daily/silvatab-backup && ls -lh /var/backups/silvatab
```

Copy these files off the server regularly (a backup on the same disk is not a backup).

Restore:

```bash
cd /opt/silvatab
sudo docker compose exec -T mongo mongorestore --archive --gzip --drop < /var/backups/silvatab/silvatab-YYYY-MM-DD.archive.gz
```

## 9. Updating

`scripts/deploy.sh` backs up the database, resets the sources to `origin/main`, rebuilds and waits for the containers to be healthy. Run it by hand with `sudo /opt/silvatab/scripts/deploy.sh`, or from GitHub (below).

The `mongo-data` volume is untouched. Never run `docker compose down -v`: `-v` deletes the database.

### Deploy from GitHub Actions

GitHub → **Actions** → **Deploy** → **Run workflow**. The job SSHes into the server and runs the script above; it fails if a container doesn't become healthy.

One-time setup on the server — a dedicated user that can only run the deploy script as root:

```bash
sudo adduser --disabled-password --gecos "" deploy
echo 'deploy ALL=(root) NOPASSWD: /opt/silvatab/scripts/deploy.sh' | sudo tee /etc/sudoers.d/silvatab-deploy
sudo chmod 440 /etc/sudoers.d/silvatab-deploy

sudo -u deploy ssh-keygen -t ed25519 -N "" -C github-deploy -f /home/deploy/.ssh/id_ed25519
sudo -u deploy cp /home/deploy/.ssh/id_ed25519.pub /home/deploy/.ssh/authorized_keys
sudo cat /home/deploy/.ssh/id_ed25519          # -> secret SSH_KEY
sudo rm /home/deploy/.ssh/id_ed25519*          # the private key now only lives in GitHub
# The Action's SSH client (Go) prefers the ECDSA host key over ed25519
ssh-keygen -lf /etc/ssh/ssh_host_ecdsa_key.pub | cut -d' ' -f2     # -> secret SSH_FINGERPRINT
```

Then in GitHub → **Settings** → **Secrets and variables** → **Actions**, add:

| Secret | Value |
|--------|-------|
| `SSH_HOST` | server hostname or IP |
| `SSH_PORT` | only if SSH isn't on 22 |
| `SSH_USER` | `deploy` |
| `SSH_KEY` | the private key printed above |
| `SSH_FINGERPRINT` | the host key fingerprint (`SHA256:...`), protects against a spoofed server |

Anyone who can push to `main` effectively gets root on the server through this script: keep write access to the repo restricted.

### Migrating an install made with tar/scp

```bash
cd /opt/silvatab
sudo git init -q -b main
sudo git remote add origin https://github.com/SilvaUnCompte/SilvaTab.git
sudo git fetch -q origin main
sudo git reset --hard origin/main
sudo git clean -fd      # removes leftovers of old uploads; .env is ignored, so kept
```

## Operations cheat sheet

| Action | Command (in `/opt/silvatab`) |
|--------|------------------------------|
| Status | `sudo docker compose ps` |
| Logs | `sudo docker compose logs -f app` |
| Restart | `sudo docker compose restart app` |
| Stop | `sudo docker compose down` |
| Rotate MCP token | edit `.env`, then `sudo docker compose up -d` (update Claude's connector) |
| Change UI password | edit `.env`, then `sudo docker compose up -d` (logs everyone out) |

## Known caveat

Fastify logs each request URL, so with the `?token=` connector the MCP token appears in `docker compose logs app`. It stays on the server, but prefer the `Authorization` header when the client supports it, and rotate the token if logs are shared.
