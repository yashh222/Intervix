# Intervix AI

An AI-powered interview practice app. Choose an interview topic, practice with a conversational voice interviewer, and get feedback based on your answers. Upload a resume to personalize the interview, and choose a supported language and voice.

## Features

- AI-generated interview questions and personalized feedback
- Optional resume upload (PDF, DOCX, or TXT; maximum 12 MB)
- Voice interviewer audio and recorded-answer transcription
- Account signup and login with SQLite-backed users
- Language and voice preferences
- Docker Compose setup with a named volume for account and upload data

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Python, Flask, LangChain, LangGraph
- **AI and audio:** OpenRouter, Murf, AssemblyAI
- **Storage and deployment:** SQLite, Docker, Docker Compose, Waitress

## Run locally

### Requirements

- Python 3.10 or later
- Node.js and npm
- API keys for the services you want to use (see [Environment variables](#environment-variables))

### 1. Configure environment

Copy `.env.example` to `.env` in the repository root, then add your API keys and a strong random Flask secret:

```powershell
Copy-Item .env.example .env
```

### 2. Install dependencies

From the repository root:

```powershell
python -m pip install -r backend/requirements.txt
cd frontend
npm install
```

### 3. Start the app

Run the backend from the repository root:

```powershell
python backend/app.py
```

In a second terminal, start the frontend:

```powershell
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Vite proxies API requests to Flask on port 5000. On Windows, `run.ps1` can start both processes.

## Run with Docker Compose

Create the root `.env` file as described above, then run:

```powershell
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Compose runs the frontend and backend in separate containers. The `intervix-data` named volume stores SQLite accounts and uploaded resumes across container restarts.

Stop the containers with `Ctrl+C`, or run:

```powershell
docker compose down
```

The named volume is retained when containers are stopped. To remove it and its stored data, run `docker compose down --volumes`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Access to the language model used for questions and feedback. |
| `OPENROUTER_MODEL` | Primary OpenRouter model; defaults to `openai/gpt-4o-mini`. |
| `OPENROUTER_FALLBACK_MODEL` | Fallback model; defaults to `openrouter/free`. Availability and limits depend on the provider. |
| `MURF_API_KEY` | Generates interviewer speech. |
| `ASSEMBLYAI_API_KEY` | Transcribes recorded answers. |
| `FLASK_SECRET_KEY` | Signs the HTTP-only authentication session cookie. Set a unique, long random value. |
| `SESSION_COOKIE_SECURE` | Set to `1` when served over HTTPS; use `0` for local HTTP. |
| `FRONTEND_ORIGIN` | Allowed frontend origin(s), comma-separated. Defaults to `http://localhost:3000`. |
| `PORT` | Flask server port; defaults to `5000`. |
| `FLASK_DEBUG` | Enables Flask debug mode when set to `1`; keep disabled for deployment. |

Keep `.env` and API keys out of source control. For hosted deployments, configure secrets in the hosting provider's environment-variable settings. API providers may have separate usage limits or charges.

## Production build

Build the frontend assets with:

```powershell
cd frontend
npm run build
```

The generated files are written to `frontend/dist`. The Flask application can serve the built single-page app and API. For production, run Flask through the included Waitress setup and put a TLS-enabled web server or reverse proxy in front of it. Docker Compose is the recommended local production-style setup.

## Project structure

```text
.
├── backend/
│   ├── app.py                 # Interview, audio, resume, and API routes
│   ├── auth.py                # SQLite-backed signup, login, and sessions
│   ├── requirements.txt       # Python dependencies
│   └── Dockerfile
├── frontend/
│   ├── app/                   # Application pages
│   ├── src/                   # Frontend entry point and styles
│   ├── lib/api.ts             # Frontend API client
│   ├── public/                # Static assets
│   ├── package.json
│   └── Dockerfile
├── compose.yaml               # Local multi-container setup
├── run.ps1                    # Windows local runner
└── .env.example               # Environment variable template
```

## Notes

- Passwords are hashed before storage. Authentication uses a signed, HTTP-only session cookie.
- Resume uploads are limited to 12 MB and support PDF, DOCX, and TXT. Extracted text is used to personalize interview prompts.
- Interview state and resume text are held in backend memory while an interview is in progress; restarting the backend clears active sessions.
- The `/health` endpoint returns the backend health status.
