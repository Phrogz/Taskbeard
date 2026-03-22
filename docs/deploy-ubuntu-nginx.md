# Deploy on Ubuntu with nginx

This document reflects the current production host setup for Taskbeard.

## 1) System packages
```bash
sudo apt update
sudo apt install -y nginx curl
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## 2) App setup
```bash
cd /var/www/taskbeard
uv sync
cd frontend
npm ci
npm run build
```

## 3) systemd service (backend)
Create `/etc/systemd/system/taskbeard.service`:

```ini
[Unit]
Description=Taskbeard FastAPI
After=network.target

[Service]
User=phrogz
Group=www-data
WorkingDirectory=/var/www/taskbeard
EnvironmentFile=/var/www/taskbeard/.env.production
ExecStart=/usr/bin/env uv run uvicorn backend.app.main:app --host 127.0.0.1 --port 18000
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable taskbeard
sudo systemctl start taskbeard
sudo systemctl status taskbeard
```

## 4) nginx reverse proxy
Create `/etc/nginx/conf.d/taskbeard.conf`:

```nginx
server {
    listen 443 ssl;
    server_name taskbeard.phrogz.net;

    root /var/www/taskbeard/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:18000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /events {
        proxy_pass http://127.0.0.1:18000/events;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Cache-Control no-cache;
        proxy_buffering off;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

Add a separate HTTP server block for redirect to HTTPS:

```nginx
server {
    listen 80;
    server_name taskbeard.phrogz.net;
    return 301 https://$host$request_uri;
}
```

Enable and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Deploy updates on this host:

```bash
cd /var/www/taskbeard/frontend
npm ci
npm run build
sudo systemctl restart taskbeard
sudo systemctl reload nginx
```

## 5) Permissions and backups
- Ensure the service account can write `/var/www/taskbeard/data`.
- Back up YAML files under `data/` regularly.
