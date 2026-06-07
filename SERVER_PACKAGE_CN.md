# 保知 Demo 交付包说明

这份交付包用于把项目源码安全地交给服务器部署方。

## 包内内容

交付包包含：

- 前后端源码
- `assets/` 静态资源
- `deploy/` 部署配置
- `Dockerfile`
- `package.json`
- `package-lock.json`
- `DEPLOY_SERVER.md`
- `DEPLOY_TO_SERVER_CN.md`
- 本说明文档

## 已排除的本机内容

为了避免泄露你本机上的隐私配置或无关文件，交付包不会包含：

- `.env`
- `.git/`
- `node_modules/`
- `dist/`
- `output/`
- `tmp/`
- `.playwright-cli/`
- 本地日志
- 你电脑上的其他压缩包或临时文件

## 推荐部署方式

如果只是演示环境，推荐优先使用：

1. `Node.js + systemd + nginx`
2. 或 `Docker + nginx`

详细步骤见：

- `DEPLOY_TO_SERVER_CN.md`

如果部署方更习惯英文，也可以参考：

- `DEPLOY_SERVER.md`

## 更新源码包时要注意

如果这是发给部署方的**更新版本源码包**，不能只重启旧服务。

- Node.js 部署：重新执行 `npm ci --include=dev` 和 `npm run build`
- Docker 部署：重新执行 `docker compose down`、`docker compose build --no-cache`、`docker compose up -d`

否则服务器可能仍然在使用旧的 `dist/` 或旧镜像，导致修复看起来“没有生效”。

## 部署方需要自己准备的内容

交付包不包含任何真实 API Key。部署方需要自行填写：

- `QWEN_API_KEY`
- 或 `OPENAI_API_KEY`
- 或 `DEEPSEEK_API_KEY`
- 或 `CLAUDE_API_KEY`

建议直接从：

- `deploy/.env.server.example`

复制为服务器上的 `.env` 后再填写。

## 最短部署路径

以 Linux 服务器为例：

```bash
unzip baozhi-demo-server-package.zip -d /opt/baozhi-demo
cd /opt/baozhi-demo
cp deploy/.env.server.example .env
nano .env
npm ci --include=dev
npm run build
npm start
```

确认服务正常后，再接入 `systemd` 和 `nginx`。
