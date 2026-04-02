from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Optional
from ollama import chat, ChatResponse
from duckduckgo_search import DDGS
import pdfplumber
from docx import Document
import uuid
import re

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
    chat_id: Optional[str] = None
    role: Optional[str] = None
    task_type: Optional[str] = None
    financial_data: Optional[dict] = None
    travel_data: Optional[dict] = None
    health_data: Optional[dict] = None
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


def handle_travel(req: ChatRequest):
    """
    Handler for travel assistant role.
    Combines user message with travel data and system prompt.
    """
    travel_context = req.travel_data or {}

    system_prompt = """You are a smart AI travel assistant.

Your job is to help users plan trips based on:
- budget
- number of days
- destination
- interests (adventure, food, culture, etc.)

Always respond in the following structured format:

Destination Overview:
(short description)

Day-wise Itinerary:
Day 1:
- activities

Day 2:
- activities

(and so on)

Estimated Budget Breakdown:
- Travel:
- Stay:
- Food:
- Activities:
- Total:

Suggestions:
- tips
- best time to visit
- travel advice

Keep responses clear, practical, and realistic."""

    # Build context from travel data
    context_parts = [
        f"Budget: ₹{travel_context.get('budget', 'Not specified')}",
        f"Days: {travel_context.get('days', 'Not specified')}",
        f"Location: {travel_context.get('location', 'Not specified')}",
        f"Interests: {travel_context.get('interests', 'Not specified')}",
    ]

    travel_context_str = "\n".join(context_parts)

    # Combine into full system message
    full_system = f"{system_prompt}\n\nTrip Details:\n{travel_context_str}"

    return full_system


def handle_health(req: ChatRequest):
    """
    Handler for health assistant role.
    Combines user message with health data and system prompt.
    """
    health_context = req.health_data or {}

    system_prompt = """You are a certified fitness and nutrition coach.

Your job is to help users with:
- workout planning
- diet planning
- healthy lifestyle advice

You will receive:
- age
- weight
- fitness goal
- activity level

Always respond in the following structured format:

User Analysis:
- brief assessment based on input

Workout Plan:
Day 1:
- exercises with sets/reps

Day 2:
- exercises

(or weekly split if better)

Diet Plan:
Breakfast:
Lunch:
Dinner:
Snacks:

(include simple, practical foods)

Health Tips:
- hydration
- sleep
- consistency
- precautions

Important Rules:
- Keep plans realistic and beginner-friendly unless specified
- Avoid extreme diets or unsafe advice
- Do not give medical diagnoses
- Keep answers structured and easy to follow"""

    context_parts = [
        f"Age: {health_context.get('age', 'Not specified')}",
        f"Weight (kg): {health_context.get('weight', 'Not specified')}",
        f"Goal: {health_context.get('goal', 'Not specified')}",
        f"Activity Level: {health_context.get('activity_level', 'Not specified')}",
    ]

    health_context_str = "\n".join(context_parts)

    full_system = f"{system_prompt}\n\nUser Health Data:\n{health_context_str}"

    return full_system


def parse_health_reply(reply: str):
    text = (reply or "").strip()

    def extract_section(name: str, next_headers: List[str]):
        heading = rf"(?:\*\*\s*)?{re.escape(name)}(?:\s*\*\*)?\s*:?"
        escaped_next = "|".join(
            [
                rf"(?:\*\*\s*)?{re.escape(header)}(?:\s*\*\*)?\s*:?"
                for header in next_headers
            ]
        )
        if escaped_next:
            pattern = rf"{heading}\s*([\s\S]*?)(?={escaped_next}|$)"
        else:
            pattern = rf"{heading}\s*([\s\S]*?)$"

        match = re.search(pattern, text, re.IGNORECASE)
        return match.group(1).strip() if match else ""

    return {
        "user_analysis": extract_section(
            "User Analysis", ["Workout Plan", "Diet Plan", "Health Tips"]
        ),
        "workout_plan": extract_section("Workout Plan", ["Diet Plan", "Health Tips"]),
        "diet_plan": extract_section("Diet Plan", ["Health Tips"]),
        "health_tips": extract_section("Health Tips", []),
    }


@app.post("/chat")
def chat_api(req: ChatRequest):
    try:
        chat_id = req.chat_id or f"workflow-{uuid.uuid4().hex}"

        if chat_id not in chat_sessions:
            chat_sessions[chat_id] = []

        history = chat_sessions[chat_id]

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

        elif req.role == "travel":
            system_content = handle_travel(req)

            if req.dev_prompt:
                system_content += f"\n\nAdditional instructions:\n{req.dev_prompt}"

            messages.append({"role": "system", "content": system_content})

        elif req.role == "health":
            system_content = handle_health(req)

            if req.dev_prompt:
                system_content += f"\n\nAdditional instructions:\n{req.dev_prompt}"

            messages.append({"role": "system", "content": system_content})

        messages.extend(history)

        messages.append({"role": "user", "content": req.message})

        response: ChatResponse = chat(model="llama3.1:8b", messages=messages)

        reply = response.message.content

        history.append({"role": "user", "content": req.message})
        history.append({"role": "assistant", "content": reply})

        chat_sessions[chat_id] = history[-20:]

        if req.role == "health":
            return {
                "reply": reply,
                "chat_id": chat_id,
                "structured": parse_health_reply(reply),
            }

        return {"reply": reply, "chat_id": chat_id}

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
