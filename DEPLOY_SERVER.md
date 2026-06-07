# Server Deployment

This project supports two common Linux server deployment paths:

1. Node.js + systemd + nginx
2. Docker + docker compose + nginx

The app serves the built frontend and the `/api/chat` backend from the same Node process.

## Prerequisites

- Ubuntu 22.04/24.04 or another modern Linux server
- Node.js 24
- npm
- nginx
- One model API key such as `QWEN_API_KEY`

## Important Update Note

If the deployer receives a new source package, do not just restart the old process or old container.

- For Node.js deployments, run `npm ci --include=dev` and `npm run build` again
- For Docker deployments, rebuild the image before starting the container again

Otherwise the server may keep using an older `dist/` build or an older image, and the fix will not take effect.

## Option A: Node.js + systemd

### 1. Upload code

Copy the repository to the server, for example:

```bash
scp -r ./falvdemo user@your-server:/opt/baozhi-demo
```

Or clone it:

```bash
git clone <your-repo-url> /opt/baozhi-demo
cd /opt/baozhi-demo
```

### 2. Install runtime

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
```

### 3. Install dependencies and build

```bash
cd /opt/baozhi-demo
npm ci --include=dev
npm run build
```

### 4. Configure environment variables

```bash
cp deploy/.env.server.example .env
nano .env
```

At minimum, set:

```text
NODE_ENV=production
PORT=3000
LLM_PROVIDER=qwen
QWEN_API_KEY=your_real_key
QWEN_MODEL=qwen3.6-plus
```

### 5. Install the systemd service

```bash
sudo cp deploy/baozhi-demo.service /etc/systemd/system/baozhi-demo.service
sudo systemctl daemon-reload
sudo systemctl enable baozhi-demo
sudo systemctl start baozhi-demo
sudo systemctl status baozhi-demo
```

### 6. Configure nginx reverse proxy

```bash
sudo cp deploy/nginx.baozhi-demo.conf /etc/nginx/sites-available/baozhi-demo.conf
sudo ln -s /etc/nginx/sites-available/baozhi-demo.conf /etc/nginx/sites-enabled/baozhi-demo.conf
sudo nginx -t
sudo systemctl reload nginx
```

Now the app is available on port 80.

## Option B: Docker + docker compose

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo apt-get install -y docker-compose-plugin nginx
```

### 2. Prepare environment variables

```bash
cd /opt/baozhi-demo
cp deploy/.env.server.example .env
nano .env
```

### 3. Start the app

```bash
cd /opt/baozhi-demo/deploy
sudo docker compose up -d --build
sudo docker compose ps
```

If an older version was already deployed, prefer:

```bash
cd /opt/baozhi-demo/deploy
sudo docker compose down
sudo docker compose build --no-cache
sudo docker compose up -d
```

### 4. Configure nginx

Use the same nginx file:

```bash
sudo cp /opt/baozhi-demo/deploy/nginx.baozhi-demo.conf /etc/nginx/sites-available/baozhi-demo.conf
sudo ln -s /etc/nginx/sites-available/baozhi-demo.conf /etc/nginx/sites-enabled/baozhi-demo.conf
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS

After the domain resolves to your server, add TLS with certbot:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## Useful Commands

### Node.js mode

```bash
sudo systemctl restart baozhi-demo
sudo journalctl -u baozhi-demo -f
```

### Docker mode

```bash
cd /opt/baozhi-demo/deploy
sudo docker compose logs -f
sudo docker compose restart
```

## Recommended Deployment Choice

For a quick demo on a single Linux server, use:

- Node.js + systemd if you want the fewest moving parts
- Docker if you want easier rebuilds and more reproducible environments
