from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List
from ollama import chat, ChatResponse
from duckduckgo_search import DDGS

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
    mode: str
    chat_id: str
    dev_prompt: str = ""


def search_web(query: str):
    results_text = ""

    try:
        with DDGS() as ddgs:
            results = ddgs.text(query, max_results=5)

            for r in results:
                results_text += f"{r['title']}\n{r['body']}\n{r['href']}\n\n"

    except:
        return ""

    return results_text


@app.post("/chat")
def chat_api(req: ChatRequest):
    try:
        if req.chat_id not in chat_sessions:
            chat_sessions[req.chat_id] = []

        history = chat_sessions[req.chat_id]

        messages = []

        if req.mode == "company":
            web_data = search_web(req.message)

            system_content = """
You are an AI assistant.

You MUST answer ONLY using the provided web data below.

Rules:
- Do NOT say "I don't have real-time data"
- Do NOT suggest checking other websites
- Do NOT use your own knowledge
- If web data is present, answer directly from it
- If web data is missing, say: "No internet data found"

Answer clearly and directly.
"""

            if req.dev_prompt:
                system_content += f"\n\nDeveloper Instruction:\n{req.dev_prompt}"

            if web_data:
                system_content += f"\n\nWeb Data:\n{web_data}"
            else:
                system_content += (
                    "\n\nNo web data found. Answer based on general knowledge."
                )

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


@app.post("/reset")
def reset_chat(data: dict):
    chat_id = data.get("chat_id")

    if chat_id in chat_sessions:
        chat_sessions[chat_id] = []

    return {"status": "cleared"}
