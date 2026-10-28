# Intervix AI

Interview practice app with a React/Vite frontend and the existing Flask AI backend.

## Setup

1. Copy `.env.example` to `.env` and fill in `OPENROUTER_API_KEY`, `MURF_API_KEY`, and `ASSEMBLYAI_API_KEY`. Set `FLASK_SECRET_KEY` to a long random value.
2. Install backend dependencies: `python -m pip install -r backend/requirements.txt`.
3. Install frontend dependencies: `cd frontend` then `npm install`.

## Run locally

In two terminals from the repository root:

```powershell
python backend/app.py
```

```powershell
cd frontend
npm run dev
```

Open `http://127.0.0.1:3000`. `run.ps1` starts both processes in the background on Windows.

## Environment

- `OPENROUTER_API_KEY`: OpenRouter access for interview questions and feedback.
- `OPENROUTER_MODEL`: model slug from the OpenRouter catalog; defaults to `openai/gpt-4o-mini`.
- `OPENROUTER_FALLBACK_MODEL`: model tried by OpenRouter if the primary model is unavailable; defaults to the free `openrouter/free` router. Free-model availability and rate limits can vary.
- `MURF_API_KEY`: streamed interviewer speech.
- `ASSEMBLYAI_API_KEY`: speech transcription for recorded answers.
- `FLASK_SECRET_KEY`: signs the HTTP-only session cookie.
- `SESSION_COOKIE_SECURE`: set to `1` behind HTTPS in production; keep `0` for local HTTP development.
- `FRONTEND_ORIGIN`: comma-separated development origins allowed by Flask CORS.
- `PORT`, `FLASK_DEBUG`: optional backend port and debug switch.

Passwords are hashed in a local SQLite database. Authentication uses a signed, HTTP-only session cookie. Resume uploads are limited to 12 MB and PDF, DOCX, and TXT text is extracted to personalize interview prompts.

## Production

Build the frontend with `cd frontend; npm run build`. The build is written to `frontend/dist`. Run the Flask backend with the same production environment variables; it serves the Vite single-page app from `frontend/dist` and handles `/api` requests. Put a production web server or reverse proxy in front of Flask for TLS and request limits.

## Docker

Set the required keys in the root `.env` file, then build and start the production container:

```powershell
docker compose up --build
```

Open `http://localhost:5000`. Docker builds the Vite frontend and serves it through Waitress and Flask. SQLite accounts and uploaded resumes persist in the `intervix-data` named volume. Stop the container with `Ctrl+C`; use `docker compose down` to remove the container while keeping that volume.
