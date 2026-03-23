import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [mode, setMode] = useState("general");

  const [devPrompt, setDevPrompt] = useState(
    localStorage.getItem("devPrompt") || ""
  );

  const [showPromptBox, setShowPromptBox] = useState(false);

  const [chats, setChats] = useState(() => {
    return JSON.parse(localStorage.getItem("chats") || "{}");
  });

  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    localStorage.setItem("chats", JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem("devPrompt", devPrompt);
  }, [devPrompt]);

  useEffect(() => {
    if (currentChatId && chats[currentChatId]) {
      setMessages(chats[currentChatId]);
    } else {
      setMessages([]);
    }
  }, [currentChatId, chats]);

  useEffect(() => {
    setCurrentChatId(null);
    setMessages([]);
  }, [mode]);

  const handleToggle = () => {
    setMode(mode === "general" ? "company" : "general");
  };

  const newChat = () => {
    setCurrentChatId(null);
    setMessages([]);
  };

  const loadChat = (id) => {
    setCurrentChatId(id);
  };

  const deleteChat = (id) => {
    const updated = { ...chats };
    delete updated[id];
    setChats(updated);

    if (currentChatId === id) newChat();
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    let chatId = currentChatId;

    if (!chatId) {
      chatId = Date.now().toString();
      setCurrentChatId(chatId);
      setChats((prev) => ({ ...prev, [chatId]: [] }));
    }

    const userMsg = { sender: "user", text: input };

    setMessages((prev) => [...prev, userMsg]);
    setChats((prev) => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), userMsg],
    }));

    setInput("");

    const res = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: input,
        mode: mode,
        chat_id: chatId,
        dev_prompt: devPrompt,
      }),
    });

    const data = await res.json();

    const botMsg = { sender: "bot", text: data.reply };

    setMessages((prev) => [...prev, botMsg]);
    setChats((prev) => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), botMsg],
    }));
  };

  return (
    <div className={`app ${mode === "general" ? "light" : "dark"}`}>

      <div className="sidebar">
        <button className="newChat" onClick={newChat}>+ New Chat</button>

        <div className="history">
          {Object.keys(chats).map((id) =>
            chats[id].length ? (
              <div key={id} className="historyItem">
                <span onClick={() => loadChat(id)}>
                  {chats[id][0].text}
                </span>
                <button onClick={() => deleteChat(id)}>x</button>
              </div>
            ) : null
          )}
        </div>
      </div>

      <div className="main">

        <div className="topbar">
          <span>
            {mode === "general" ? "General AI" : "Company AI"}
          </span>

          {mode === "company" && (
            <button
              className="promptBtn"
              onClick={() => setShowPromptBox(true)}
            >
              Developer Prompt
            </button>
          )}

          <div
            className={`toggleSwitch ${mode === "company" ? "active" : ""}`}
            onClick={handleToggle}
          >
            <div className="toggleCircle"></div>
          </div>
        </div>

        <div className="chat">
          {messages.map((msg, i) => (
            <div key={i} className={`row ${msg.sender}`}>
              <div className="bubble">{msg.text}</div>
            </div>
          ))}
        </div>

        <div className="inputBox">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Send a message..."
          />
          <button onClick={sendMessage}>➤</button>
        </div>

      </div>

      {showPromptBox && (
        <div className="modal">
          <div className="modalContent">
            <h3>Developer Prompt</h3>

            <textarea
              value={devPrompt}
              onChange={(e) => setDevPrompt(e.target.value)}
              placeholder="Define AI behavior..."
            />

            <div className="modalActions">
              <button onClick={() => setShowPromptBox(false)}>Save</button>
              <button onClick={() => setDevPrompt("")}>Clear</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;