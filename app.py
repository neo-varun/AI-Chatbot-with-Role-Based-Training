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


def load_file(path):
    try:
        with open(path, "r") as f:
            return f.read()
    except:
        return ""


SYSTEM_PROMPT = f"""
You are an intelligent assistant.

Step 1: Classify the user's query into one of:
- HR
- Tech
- Sales

Step 2: Use the appropriate knowledge below to answer.

HR Knowledge:
{load_file("system_prompts/hr.txt")}

Tech Knowledge:
{load_file("system_prompts/tech.txt")}

Sales Knowledge:
{load_file("system_prompts/sales.txt")}

Step 3: Respond naturally.
Do NOT mention the category explicitly.
"""


@app.post("/chat")
def chat_api(req: ChatRequest):
    global chat_history

    try:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

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
