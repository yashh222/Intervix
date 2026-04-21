from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent
import assemblyai as aai
import os
import base64
import requests
import tempfile
import json
import PyPDF2
from langchain_core.messages import HumanMessage

# Load env
load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
MURF_API_KEY = os.getenv("MURF_API_KEY")
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")

aai.settings.api_key = ASSEMBLYAI_API_KEY

# Initialize Flask
app = Flask(__name__)
CORS(app, expose_headers=['X-Question-Number', 'X-Interview-Complete'])

# Initialize model + memory
checkpointer = InMemorySaver()

model = init_chat_model(
    "google_genai:gemini-2.5-flash",
    api_key=GOOGLE_API_KEY
)

agent = create_agent(
    model=model,
    tools=[],
    checkpointer=checkpointer
)

# Global state
question_count = 0
current_subject = ""
thread_id = "interview_session"
resume_context = ""

# Prompts
INTERVIEW_PROMPT = """You are Natalie, a friendly and conversational interviewer conducting a natural {subject} interview.
{context}

IMPORTANT GUIDELINES:
1. Ask exactly 5 questions total
2. Keep questions SHORT (1-2 sentences)
3. Only reference what candidate ACTUALLY said
4. Be conversational and concise
"""

FEEDBACK_PROMPT = """Return JSON only:
{{
"subject": "<topic>",
"candidate_score": <1-5>,
"feedback": "<strengths>",
"areas_of_improvement": "<improvements>"
}}
"""

# -------- AUDIO STREAM --------
def stream_audio(text):
    BASE_URL = "https://global.api.murf.ai/v1/speech/stream"

    payload = {
        "text": text,
        "voiceId": "en-US-natalie",
        "model": "FALCON",
        "format": "MP3",
    }

    headers = {
        "Content-Type": "application/json",
        "api-key": MURF_API_KEY
    }

    response = requests.post(BASE_URL, headers=headers, json=payload, stream=True)

    for chunk in response.iter_content(chunk_size=4096):
        if chunk:
            yield base64.b64encode(chunk).decode() + "\n"

# -------- RESUME UPLOAD --------
@app.route("/upload-resume", methods=["POST"])
def upload_resume():
    global resume_context

    if 'resume' not in request.files:
        return jsonify({"success": False}), 400

    file = request.files['resume']

    try:
        pdf_reader = PyPDF2.PdfReader(file)
        text = ""

        for page in pdf_reader.pages:
            text += page.extract_text() or ""

        response = model.invoke([
            HumanMessage(content=f"Summarize projects:\n{text}")
        ])

        resume_context = response.content

        return jsonify({"success": True})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# -------- START INTERVIEW --------
@app.route("/start-interview", methods=["POST"])
def start_interview():
    global question_count, current_subject, agent, checkpointer

    data = request.json
    current_subject = data.get("subject", "Python")

    question_count = 1

    checkpointer = InMemorySaver()
    agent = create_agent(model=model, tools=[], checkpointer=checkpointer)

    config = {"configurable": {"thread_id": thread_id}}

    context_text = f"Context:\n{resume_context}" if resume_context else ""

    prompt = INTERVIEW_PROMPT.format(
        subject=current_subject,
        context=context_text
    )

    response = agent.invoke({
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": "Start interview"}
        ]
    }, config=config)

    question = response["messages"][-1].content

    return Response(stream_audio(question), mimetype='text/plain')

# -------- SPEECH TO TEXT --------
def speech_to_text(audio_path):
    transcriber = aai.Transcriber()
    transcript = transcriber.transcribe(audio_path)
    return transcript.text or ""

# -------- SUBMIT ANSWER --------
@app.route("/submit-answer", methods=["POST"])
def submit_answer():
    global question_count

    audio_file = request.files["audio"]

    temp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".webm").name
    audio_file.save(temp_path)

    answer = speech_to_text(temp_path)
    os.unlink(temp_path)

    config = {"configurable": {"thread_id": thread_id}}

    agent.invoke({"messages": [{"role": "user", "content": answer}]}, config=config)

    if question_count >= 5:
        return Response(
            stream_audio("Interview complete. Thank you!"),
            headers={'X-Interview-Complete': 'true'}
        )

    question_count += 1

    response = agent.invoke({
        "messages": [{"role": "user", "content": "Next question"}]
    }, config=config)

    question = response["messages"][-1].content

    return Response(
        stream_audio(question),
        headers={'X-Question-Number': str(question_count)}
    )

# -------- FEEDBACK --------
@app.route("/get-feedback", methods=["POST"])
def get_feedback():
    config = {"configurable": {"thread_id": thread_id}}

    response = agent.invoke({
        "messages": [{"role": "user", "content": FEEDBACK_PROMPT}]
    }, config=config)

    try:
        feedback = json.loads(response["messages"][-1].content)
    except:
        feedback = {"feedback": response["messages"][-1].content}

    return jsonify(feedback)

# -------- RUN SERVER --------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
