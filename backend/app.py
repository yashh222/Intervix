from flask import Flask,request,jsonify,Response,session,send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
import assemblyai as aai
import os
import base64
import requests
import tempfile
import json
import uuid
import secrets
from pathlib import Path
from werkzeug.utils import secure_filename
from auth import auth, init_auth_db, login_required

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
OPENROUTER_FALLBACK_MODEL = os.getenv("OPENROUTER_FALLBACK_MODEL", "openrouter/free")
MURF_API_KEY = os.getenv("MURF_API_KEY")
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
aai.settings.api_key = ASSEMBLYAI_API_KEY
interviews = {}
resume_texts = {}
model = None


def get_model():
    global model
    if model is None:
        if not OPENROUTER_API_KEY:
            raise RuntimeError("OPENROUTER_API_KEY is not configured. Add it to the root .env file.")
        model = ChatOpenAI(
            model=OPENROUTER_MODEL,
            api_key=OPENROUTER_API_KEY,
            base_url="https://openrouter.ai/api/v1",
            # OpenRouter tries these models in order when the primary is unavailable.
            extra_body={"models": list(dict.fromkeys([OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODEL]))},
            default_headers={
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "Intervix AI",
            },
        )
    return model

INTERVIEW_PROMPT = """You are Natalie, a friendly and conversational interviewer conducting a natural {subject} interview.

IMPORTANT GUIDELINES:
1. Ask exactly 5 questions total throughout the interview
2. Keep questions SHORT and CRISP (1-2 sentences maximum)
3. ALWAYS reference what the candidate ACTUALLY said in their previous answer - do NOT make up or assume their answers
4. Show genuine interest with brief acknowledgments based on their REAL responses
5. Adapt questions based on their ACTUAL responses - go deeper if they're strong, adjust if uncertain
6. Be warm and conversational but CONCISE
7. No lengthy explanations - just ask clear, direct questions

CRITICAL: Read the conversation history carefully. Only acknowledge what the candidate truly said, not what you think they might have said.

Keep it short, conversational, and adaptive!"""

FEEDBACK_PROMPT = """Based on our complete interview conversation, provide detailed feedback as JSON only:
    {{
    "subject": "<topic>",
    "candidate_score": <1-5>,
    "feedback": "<detailed strengths with specific examples 
    from their ACTUAL answers>",
    "areas_of_improvement": "<constructive suggestions based 
    on gaps you noticed>"
    }}
    Be specific - reference ACTUAL things they said during the interview."""


app = Flask(__name__)
@app.get("/health")
def health():
    return {"status": "healthy"}, 200

app.secret_key = os.getenv("FLASK_SECRET_KEY") or secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE", "0") == "1",
)
app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024
CORS(app, origins=os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(","), supports_credentials=True,
     expose_headers=['X-Question-Number', 'X-Interview-Complete'])
app.register_blueprint(auth)
init_auth_db()
TOPICS = ["Self Introduction", "Generative AI", "Python", "English", "HTML", "CSS"]
LANGUAGES = {"English": ("en-US", "en-US-natalie"), "Hindi": ("hi-IN", "hi-IN-ayushi"), "Marathi": ("mr-IN", "mr-IN-abhilash"), "Spanish": ("es-ES", "es-ES-natalia"), "French": ("fr-FR", "fr-FR-juliette"), "German": ("de-DE", "de-DE-natalie")}
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", Path(__file__).with_name("uploads")))
FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"


def stream_audio(text, language="English", voice_accent=None):
    if not MURF_API_KEY:
        raise RuntimeError("MURF_API_KEY is not configured. Add it to the root .env file.")
    BASE_URL = "https://global.api.murf.ai/v1/speech/stream"
    payload = {
        "text": text,
        "voiceId": voice_accent or LANGUAGES.get(language, LANGUAGES["English"])[1],
        "model": "FALCON",
        "locale": "-".join((voice_accent or LANGUAGES.get(language, LANGUAGES["English"])[1]).split("-")[:2]),
        "sampleRate": 24000,
        "format": "MP3",
    }

    headers = {
        "Content-Type": "application/json",
        "api-key": MURF_API_KEY
    }
    response = requests.post(
        BASE_URL,
        headers=headers,
        data=json.dumps(payload),
        stream=True,
        timeout=(10, 120)
    )
    response.raise_for_status()
    def chunks():
        for chunk in response.iter_content(chunk_size=4096):
            if chunk:
                yield base64.b64encode(chunk).decode("utf-8") + "\n"
    return chunks()



@app.route("/start-interview", methods=["POST"])
@app.route("/api/start-interview", methods=["POST"])
@login_required
def start_interview():
    data = request.get_json(silent=True) or {}
    current_subject = data.get("subject", "Python")
    language = data.get("language", session.get("preferred_language", "English"))
    session["interview_language"] = language if language in LANGUAGES else "English"
    session["voice_accent"] = data.get("voiceAccent") or session.get("preferred_voice") or LANGUAGES[session["interview_language"]][1]
    try:
        checkpointer = InMemorySaver()
        interview_agent = create_agent(model=get_model(), tools=[], checkpointer=checkpointer)
    except RuntimeError as error:
        return jsonify(error=str(error)), 503
    thread_id = str(session["user_id"])
    interviews[session["user_id"]] = {"agent": interview_agent, "checkpointer": checkpointer, "question_count": 1, "subject": current_subject, "thread_id": thread_id}
    config = {"configurable": {"thread_id": thread_id}}
    formatted_prompt = INTERVIEW_PROMPT.format(subject=current_subject) + f"\nConduct the entire interview in {session['interview_language']}. Respond only in that language."
    if resume_texts.get(session["user_id"]):
        formatted_prompt += f"\nUse this candidate resume to personalize questions without inventing details:\n{resume_texts[session['user_id']][:8000]}"
    try:
        response = interview_agent.invoke({
            "messages": [
                {"role": "system", "content": formatted_prompt},
                {"role": "user", "content": f"Start the interview with a warm greeting and ask the first question about {current_subject}. Keep it SHORT (1-2 sentences)."}
            ]
        }, config=config)
    except Exception as error:
        interviews.pop(session["user_id"], None)
        app.logger.exception("Could not generate the first interview question")
        return jsonify(error=f"Interview AI service error: {error}"), 502
    question = response["messages"][-1].text
    print(f"\n[Question 1] {question}")
    try:
        audio = stream_audio(question, session["interview_language"], session["voice_accent"])
    except (RuntimeError, requests.RequestException) as error:
        return jsonify(error=f"Speech service error: {error}"), 502
    return Response(audio, mimetype="text/plain")

def speech_to_text(audio_path):
  """Convert audio file to text using AssemblyAI"""
  transcriber = aai.Transcriber()
  config = aai.TranscriptionConfig(
        speech_models=["universal-3-pro", "universal-2"],
        language_detection=True, speaker_labels=True,
    )
  transcript = transcriber.transcribe(audio_path, config=config)
  return transcript.text if transcript.text else ""



@app.route("/submit-answer", methods=["POST"])
@app.route("/api/submit-answer", methods=["POST"])
@login_required
def submit_answer():
    """Process user's answer and generate next question"""
    state = interviews.get(session.get("user_id"))
    if not state:
        return jsonify(error="Start an interview before submitting an answer."), 400
    question_count = state["question_count"]
    interview_agent = state["agent"]
    config = {"configurable": {"thread_id": state["thread_id"]}}
    
    audio_file = request.files.get("audio")
    if not audio_file:
        return jsonify(error="Upload an audio recording to submit your answer."), 400
    
    temp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".webm").name
    audio_file.save(temp_path)
    
    try:
        answer = speech_to_text(temp_path)
    except Exception:
        return jsonify(error="Speech transcription failed. Check ASSEMBLYAI_API_KEY and try again."), 502
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
    
    if not answer or answer.strip() == "":
        answer = "[Candidate provided a verbal response]"
    
    print(f"[Answer {question_count}] {answer}")
    
    interview_agent.invoke({"messages": [{"role": "user", "content": answer}]}, config=config)
    
    if question_count >= 5:
        response = interview_agent.invoke({
            "messages": [{"role": "user", "content": "That was the 5th question. Briefly acknowledge their ACTUAL answer and let them know the interview is complete. Keep it SHORT."}]
        }, config=config)
        
        closing_message = response["messages"][-1].text
        print(f"\n[Closing] {closing_message}")
        
        try:
            audio = stream_audio(closing_message, session.get("interview_language", "English"), session.get("voice_accent"))
        except (RuntimeError, requests.RequestException) as error:
            return jsonify(error=f"Speech service error: {error}"), 502
        return Response(
            audio,
            mimetype='text/plain',
            headers={'X-Interview-Complete': 'true'}
        )
    
    question_count += 1
    state["question_count"] = question_count
    
    prompt = f"""The candidate just answered question {question_count - 1}.

Look at their ACTUAL answer above. Do NOT assume or make up what they said.

Now ask question {question_count} of 5:
1. Briefly acknowledge what they ACTUALLY said (1 sentence) - quote their exact words if needed
2. Ask your next question that builds on their REAL response (1-2 sentences)
3. If they said "I don't know" or gave a wrong answer, acknowledge that and ask something simpler
4. Keep the TOTAL response under 3 sentences

Be conversational but CONCISE. Only reference what they truly said."""
    
    response = interview_agent.invoke({"messages": [{"role": "user", "content": prompt}]}, config=config)
    
    question = response["messages"][-1].text
    print(f"\n[Question {question_count}] {question}")
    
    try:
        audio = stream_audio(question, session.get("interview_language", "English"), session.get("voice_accent"))
    except (RuntimeError, requests.RequestException) as error:
        return jsonify(error=f"Speech service error: {error}"), 502
    return Response(
        audio,
        mimetype='text/plain',
        headers={'X-Question-Number': str(question_count)}
    )


@app.route("/get-feedback", methods=["POST"])
@app.route("/api/get-feedback", methods=["POST"])
@login_required
def get_feedback():
    """Generate detailed interview feedback"""
    state = interviews.get(session.get("user_id"))
    if not state:
        return jsonify(error="No interview is available for feedback."), 400
    config = {"configurable": {"thread_id": state["thread_id"]}}
    response = state["agent"].invoke({
        "messages": [
        {
            "role": "user", 
            "content": f"{FEEDBACK_PROMPT}\n\nReview our complete {state['subject']} interview conversation and provide detailed feedback in {session.get('interview_language', 'English')}."
        }
        ]
    }, config=config)
    text = response["messages"][-1].text
    print(f"\n[Feedback Generated]\n{text}\n")
    cleaned = text.strip()
    if "```" in cleaned:
        cleaned = cleaned.split("```")[1].replace("json", "").strip()
    feedback = json.loads(cleaned)

    return jsonify({"success": True, "feedback": feedback})


@app.get("/api/topics")
@login_required
def topics():
    return jsonify(topics=TOPICS)


@app.post("/api/resume")
@login_required
def upload_resume():
    file = request.files.get("resume")
    if not file or not file.filename:
        return jsonify(error="Choose a resume file."), 400
    if Path(file.filename).suffix.lower() not in {".pdf", ".docx", ".txt"}:
        return jsonify(error="Resume must be a PDF, DOCX, or TXT file."), 400
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    destination = UPLOAD_DIR / f"{uuid.uuid4().hex}-{secure_filename(file.filename)}"
    file.save(destination)
    try:
        if destination.suffix.lower() == ".txt":
            text = destination.read_text(encoding="utf-8", errors="ignore")
        elif destination.suffix.lower() == ".pdf":
            from pypdf import PdfReader
            text = "\n".join(page.extract_text() or "" for page in PdfReader(destination).pages)
        else:
            from docx import Document
            text = "\n".join(paragraph.text for paragraph in Document(destination).paragraphs)
    except Exception as error:
        destination.unlink(missing_ok=True)
        return jsonify(error=f"Could not read the resume: {error}"), 400
    resume_texts[session["user_id"]] = text
    return jsonify(filename=secure_filename(file.filename), personalized=bool(text.strip()))


@app.post("/api/preferences")
@login_required
def save_preferences():
    data = request.get_json(silent=True) or {}
    language = data.get("language", "English")
    if language not in LANGUAGES:
        return jsonify(error="Unsupported interview language."), 400
    session["preferred_language"] = language
    session["preferred_voice"] = data.get("voiceAccent") or LANGUAGES[language][1]
    return jsonify(language=language, voiceAccent=session["preferred_voice"])


@app.get("/api/preferences")
@login_required
def get_preferences():
    language = session.get("preferred_language", "English")
    return jsonify(language=language, voiceAccent=session.get("preferred_voice", LANGUAGES[language][1]))


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def serve_frontend(path):
    if path.startswith(("api/", "start-interview", "submit-answer", "get-feedback")):
        return jsonify(error="Not found"), 404
    requested = FRONTEND_DIST / path
    if path and requested.is_file():
        return send_from_directory(FRONTEND_DIST, path)
    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        return send_from_directory(FRONTEND_DIST, "index.html")
    return jsonify(error="Frontend build not found. Run npm run build in frontend."), 404


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "0") == "1", port=int(os.getenv("PORT", "5000")))
