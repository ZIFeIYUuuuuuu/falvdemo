# 保知 Demo 服务器部署说明

这份文档用于把当前项目源码交给第三方同事或运维部署到 Linux 服务器。

## 1. 项目说明

- 项目名称：保险知识库智能体 Demo
- 技术栈：`Node.js + Express + Vite + React`
- 运行方式：Node 服务同时提供前端静态页面和 `/api/chat` 接口
- 默认监听端口：`3000`

## 2. 交付包中已包含的内容

- 前后端源码
- `Dockerfile`
- `deploy/docker-compose.yml`
- `deploy/nginx.baozhi-demo.conf`
- `deploy/baozhi-demo.service`
- `deploy/.env.server.example`
- 英文版服务器部署说明 `DEPLOY_SERVER.md`
- 中文版服务器部署说明 `DEPLOY_TO_SERVER_CN.md`

## 3. 交付包中未包含的内容

为了避免泄露本机信息或敏感配置，压缩包**不会**包含：

- `.env`
- `.git`
- `node_modules`
- `dist`
- 本机测试/临时目录，如 `tmp`、`output`、`.playwright-cli`
- 本地日志文件

部署方需要自己在服务器上配置真实环境变量。

## 4. 部署前准备

建议服务器环境：

- Ubuntu 22.04 / 24.04
- Node.js 24
- npm
- nginx

如使用 Docker，也可以直接走容器部署。

## 4.1 重要更新说明

如果部署方拿到的是**新的源码包**，不要只重启旧服务或旧容器，必须重新构建。

- Node.js 方式：重新执行 `npm ci --include=dev` 和 `npm run build`
- Docker 方式：重新执行 `docker compose build --no-cache` 再 `docker compose up -d`

如果只是重启旧进程、旧容器，服务器仍可能继续使用旧的 `dist/` 或旧镜像，导致修复没有生效。

## 5. 必要环境变量

部署方至少需要准备一组模型密钥。推荐使用千问：

```env
NODE_ENV=production
PORT=3000
LLM_PROVIDER=qwen
QWEN_API_KEY=请填写真实密钥
QWEN_MODEL=qwen3.6-plus
```

如使用 OpenAI：

```env
NODE_ENV=production
PORT=3000
LLM_PROVIDER=openai
OPENAI_API_KEY=请填写真实密钥
OPENAI_MODEL=gpt-4.1-mini
```

完整变量模板见：

- `deploy/.env.server.example`

## 6. 方式一：Node.js 直接部署

### 6.1 上传源码

把压缩包上传到服务器，例如：

```bash
scp baozhi-demo-server-package.zip user@your-server:/opt/
```

然后在服务器解压：

```bash
cd /opt
unzip baozhi-demo-server-package.zip -d baozhi-demo
cd baozhi-demo
```

### 6.2 安装依赖并构建

```bash
npm ci --include=dev
npm run build
```

### 6.3 配置环境变量

```bash
cp deploy/.env.server.example .env
nano .env
```

至少填入一组真实模型密钥。

### 6.4 启动服务

先临时测试启动：

```bash
npm start
```

看到类似输出即可：

```text
[BaoZhi] running at http://127.0.0.1:3000
```

### 6.5 使用 systemd 常驻运行

把 `deploy/baozhi-demo.service` 放到系统目录：

```bash
sudo cp deploy/baozhi-demo.service /etc/systemd/system/baozhi-demo.service
sudo systemctl daemon-reload
sudo systemctl enable baozhi-demo
sudo systemctl start baozhi-demo
sudo systemctl status baozhi-demo
```

注意：

- 默认服务目录写的是 `/opt/baozhi-demo`
- 如果实际部署目录不同，需要修改 service 文件中的 `WorkingDirectory`
- 默认运行用户是 `www-data`

## 7. 方式二：Docker 部署

### 7.1 准备环境变量

```bash
cp deploy/.env.server.example .env
nano .env
```

### 7.2 启动容器

```bash
cd deploy
docker compose up -d --build
docker compose ps
```

如果之前已经部署过旧版本，建议改用下面这组命令，确保镜像和构建产物都更新：

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### 7.3 查看日志

```bash
docker compose logs -f
```

## 8. nginx 反向代理

项目已提供 nginx 示例配置：

- `deploy/nginx.baozhi-demo.conf`

部署步骤：

```bash
sudo cp deploy/nginx.baozhi-demo.conf /etc/nginx/sites-available/baozhi-demo.conf
sudo ln -s /etc/nginx/sites-available/baozhi-demo.conf /etc/nginx/sites-enabled/baozhi-demo.conf
sudo nginx -t
sudo systemctl reload nginx
```

默认会把 `80` 端口流量转发到：

- `127.0.0.1:3000`

## 9. 域名与 HTTPS

如已有域名，可先把域名解析到服务器 IP。

再使用 certbot 配 HTTPS：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 10. 常用排查命令

### Node.js 方式

```bash
sudo systemctl status baozhi-demo
sudo journalctl -u baozhi-demo -f
```

### Docker 方式

```bash
docker compose ps
docker compose logs -f
```

### 端口占用

```bash
sudo ss -ltnp | grep 3000
```

## 11. 建议交付说明

把压缩包发给部署方时，建议同步说明：

1. 压缩包不包含真实 API Key
2. 部署方需要自行填写 `.env`
3. 推荐先本地 `npm start` 验证，再接 nginx
4. 如只做演示环境，优先用 Node.js + systemd，最简单
5. 如果收到新版源码包，不能只重启服务，必须重新 build 或重新构建镜像
