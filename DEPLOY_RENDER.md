# Render Deployment

This project is ready for a Git-backed Render Web Service deploy.

## What Render Will Run

- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Runtime: `node`
- Plan: `free`
- Region: `singapore`

The app already listens on `0.0.0.0:$PORT`, so no server code change is required.

## Before Deploying

1. Create a new GitHub repository.
2. Upload this project to that repository.
3. Make sure these files are included:
   - `render.yaml`
   - `.gitignore`

## Fastest Git Setup

If this folder is not a git repo yet:

```bash
git init
git add .
git commit -m "Prepare Render deployment"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## Deploy on Render

1. Open Render Dashboard.
2. Click `New +` -> `Blueprint`.
3. Connect your GitHub account if prompted.
4. Select this repository.
5. Render will detect `render.yaml`.
6. Click `Apply`.

## Environment Variables to Add After Creation

The service can boot without an API key and fall back to local answers, but for a better demo you should add at least one model key in the Render dashboard:

- `QWEN_API_KEY`
- or `OPENAI_API_KEY`
- or `DEEPSEEK_API_KEY`
- or `CLAUDE_API_KEY`

Optional overrides:

- `LLM_PROVIDER=openai`
- `OPENAI_MODEL=gpt-4.1-mini`
- `QWEN_MODEL=qwen3.6-plus`

## Recommended Demo Setup

If you already have an OpenAI key, set:

```text
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

If you already have a DashScope/Qwen key, set:

```text
LLM_PROVIDER=qwen
QWEN_API_KEY=your_key_here
QWEN_MODEL=qwen3.6-plus
```

## After Deploy

Render will give you a URL like:

```text
https://baozhi-demo.onrender.com
```

If the first cold start is slow on the free plan, refresh once after the service wakes up.
