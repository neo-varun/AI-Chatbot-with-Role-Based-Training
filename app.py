from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Optional
from ollama import chat, ChatResponse
from duckduckgo_search import DDGS
import pdfplumber
from docx import Document

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chat_sessions: Dict[str, List] = {}


class ChatRequest(BaseModel):
    message: str
    mode: str = "general"
    chat_id: str
    role: Optional[str] = None
    financial_data: Optional[dict] = None
    dev_prompt: str = ""


def search_web(query: str):
    results_text = ""

    try:
        with DDGS() as ddgs:
            results = ddgs.text(query, max_results=5)

            for i, r in enumerate(results, 1):
                results_text += (
                    f"{i}. {r['title']}\n{r['body']}\nSource: {r['href']}\n\n"
                )

    except:
        return ""

    return results_text


def extract_text_from_pdf(file):
    text = ""
    with pdfplumber.open(file.file) as pdf:
        for page in pdf.pages:
            text += page.extract_text() or ""
    return text


def extract_text_from_docx(file):
    doc = Document(file.file)
    return "\n".join([p.text for p in doc.paragraphs])


@app.post("/chat")
def chat_api(req: ChatRequest):
    try:
        if req.chat_id not in chat_sessions:
            chat_sessions[req.chat_id] = []

        history = chat_sessions[req.chat_id]

        messages = []

        if req.mode == "company":
            system_content = ""

            if req.dev_prompt:
                system_content += req.dev_prompt

            web_data = search_web(req.message)

            if web_data:
                system_content += f"\n\nWeb Data:\n{web_data}"
            else:
                system_content += "\n\nNo web data found."

            messages.append({"role": "system", "content": system_content})

        elif req.mode == "interview":
            base_prompt = (
                "You are an AI interview assistant. "
                "Support two actions based on user input:\n"
                "1) Generate one interview question when asked for a question.\n"
                "2) Evaluate a candidate answer when asked for evaluation.\n\n"
                "For question generation: return only one clear interview question text, no extra labels.\n"
                "For evaluation: follow the output format requested by the user prompt exactly. "
                "If JSON is requested, return valid JSON only."
            )

            system_content = base_prompt

            if req.dev_prompt:
                system_content += f"\n\nAdditional instructions:\n{req.dev_prompt}"

            messages.append({"role": "system", "content": system_content})

        elif req.role == "finance" or req.mode == "finance":
            financial_context = req.financial_data or {}
            base_prompt = (
                "You are a personal finance AI assistant. "
                "Always produce practical, safe, and realistic money advice. "
                "Respond in valid JSON only with keys: analysis (string), issues (array of strings), "
                "suggestions (array of strings), action_plan (array of strings)."
            )

            system_content = (
                f"{base_prompt}\n\n"
                f"Financial Snapshot: {financial_context}\n"
                "When data is incomplete, acknowledge assumptions and keep action_plan actionable."
            )

            if req.dev_prompt:
                system_content += f"\n\nAdditional instructions:\n{req.dev_prompt}"

            messages.append({"role": "system", "content": system_content})

        messages.extend(history)

        messages.append({"role": "user", "content": req.message})

        response: ChatResponse = chat(model="llama3.1:8b", messages=messages)

        reply = response.message.content

        history.append({"role": "user", "content": req.message})
        history.append({"role": "assistant", "content": reply})

        chat_sessions[req.chat_id] = history[-20:]

        return {"reply": reply}

    except Exception as e:
        return {"reply": str(e)}


@app.post("/analyze-resume")
async def analyze_resume(
    file: UploadFile = File(...), dev_prompt: str = "", user_prompt: str = ""
):
    try:
        if file.filename.endswith(".pdf"):
            text = extract_text_from_pdf(file)
        elif file.filename.endswith(".docx"):
            text = extract_text_from_docx(file)
        else:
            return {"result": "Unsupported file format"}

        messages = []

        system_content = dev_prompt if dev_prompt else ""

        messages.append({"role": "system", "content": system_content})

        user_content = f"Analyze this resume:\n\n{text}"

        if user_prompt.strip():
            user_content = f"{user_prompt.strip()}\n\nResume:\n{text}"

        messages.append({"role": "user", "content": user_content})

        response: ChatResponse = chat(model="llama3.1:8b", messages=messages)

        return {"result": response.message.content}

    except Exception as e:
        return {"result": str(e)}


@app.post("/reset")
def reset_chat(data: dict):
    chat_id = data.get("chat_id")

    if chat_id in chat_sessions:
        chat_sessions[chat_id] = []

    return {"status": "cleared"}
