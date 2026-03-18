from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from ollama import chat, ChatResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chat_history = []


class ChatRequest(BaseModel):
    message: str
    mode: str
    role: str | None = None


def load_kb(role):
    try:
        if role == "hr":
            with open("system_prompts/hr.txt", "r") as f:
                return f.read()
        elif role == "tech":
            with open("system_prompts/tech.txt", "r") as f:
                return f.read()
        elif role == "sales":
            with open("system_prompts/sales.txt", "r") as f:
                return f.read()
    except:
        return ""
    return ""


@app.post("/chat")
def chat_api(req: ChatRequest):
    global chat_history

    try:
        messages = []

        if req.mode == "role":
            kb_text = load_kb(req.role)

            messages.append({"role": "system", "content": kb_text})

        messages.extend(chat_history)

        messages.append({"role": "user", "content": req.message})

        response: ChatResponse = chat(model="llama3.1:8b", messages=messages)

        reply = response.message.content

        chat_history.append({"role": "user", "content": req.message})
        chat_history.append({"role": "assistant", "content": reply})

        chat_history = chat_history[-20:]

        return {"reply": reply}

    except Exception as e:
        return {"reply": str(e)}


@app.post("/reset")
def reset_chat():
    global chat_history
    chat_history = []
    return {"status": "cleared"}
