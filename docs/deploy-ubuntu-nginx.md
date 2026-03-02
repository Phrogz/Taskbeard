# Deploy on Ubuntu with nginx

## 1) System packages
```bash
sudo apt update
sudo apt install -y nginx curl
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## 2) App setup
```bash
cd /opt/taskmanagement
uv sync
cd frontend
npm ci
npm run build
```

## 3) systemd service (backend)
Create `/etc/systemd/system/taskmanagement.service`:

```ini
[Unit]
Description=TaskManagement FastAPI
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/taskmanagement
ExecStart=/usr/bin/env uv run uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable taskmanagement
sudo systemctl start taskmanagement
```

## 4) nginx reverse proxy
Create `/etc/nginx/sites-available/taskmanagement`:

```nginx
server {
    listen 80;
    server_name _;

    root /opt/taskmanagement/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /events {
        proxy_pass http://127.0.0.1:8000/events;
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

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/taskmanagement /etc/nginx/sites-enabled/taskmanagement
sudo nginx -t
sudo systemctl reload nginx
```

## 5) Permissions and backups
- Ensure app user can write `/opt/taskmanagement/data`.
- Back up YAML files under `data/config` and `data/tasks` regularly.
