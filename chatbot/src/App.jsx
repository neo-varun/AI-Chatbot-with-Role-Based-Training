import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [mode, setMode] = useState("general");
  const [devPrompt, setDevPrompt] = useState(
    localStorage.getItem("devPrompt") || "",
  );
  const [showPromptBox, setShowPromptBox] = useState(false);

  const [chats, setChats] = useState(() =>
    JSON.parse(localStorage.getItem("chats") || "{}"),
  );

  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const [attachedFile, setAttachedFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const normalizeBotText = (text) => {
    if (!text) return "";

    return text
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/\r\n/g, "\n")
      .trim();
  };

  const renderFormattedText = (text) => {
    if (!text) return null;

    const lines = text.split("\n");

    return lines.map((line, lineIndex) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);

      return (
        <span key={`line-${lineIndex}`}>
          {parts.map((part, partIndex) => {
            const isBold = /^\*\*[^*]+\*\*$/.test(part);
            const value = isBold ? part.slice(2, -2) : part;

            if (!value) return null;

            return isBold ? (
              <strong key={`part-${lineIndex}-${partIndex}`}>{value}</strong>
            ) : (
              <span key={`part-${lineIndex}-${partIndex}`}>{value}</span>
            );
          })}
          {lineIndex < lines.length - 1 && <br />}
        </span>
      );
    });
  };

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
  }, [currentChatId]);

  useEffect(() => {
    setCurrentChatId(null);
    setMessages([]);
    setAttachedFile(null);
  }, [mode]);

  const updateChatMessages = (chatId, updater) => {
    setChats((prev) => {
      const prevMsgs = prev[chatId] || [];
      const newMsgs =
        typeof updater === "function" ? updater(prevMsgs) : updater;

      return {
        ...prev,
        [chatId]: newMsgs,
      };
    });
  };

  const newChat = () => {
    setCurrentChatId(null);
    setMessages([]);
    setAttachedFile(null);
  };

  const loadChat = (id) => {
    setCurrentChatId(id);
    setAttachedFile(null);
  };

  const deleteChat = (id) => {
    const updated = { ...chats };
    delete updated[id];
    setChats(updated);
    if (currentChatId === id) newChat();
  };

  const sendMessage = async () => {
    if (loading) return;

    const typedMessage = input.trim();

    if (!typedMessage) return;

    let chatId = currentChatId;

    if (!chatId) {
      chatId = Date.now().toString();
      setCurrentChatId(chatId);
    }

    const selectedFile = attachedFile;

    const fileMeta =
      mode === "company" && selectedFile
        ? {
            name: selectedFile.name,
          }
        : null;

    const userMsg = {
      sender: "user",
      text: typedMessage,
      attachment: fileMeta,
    };

    setMessages((prev) => {
      const updated = [...prev, userMsg];
      updateChatMessages(chatId, updated);
      return updated;
    });

    setInput("");
    setAttachedFile(null);
    const fileInput = document.getElementById("fileInput");
    if (fileInput) fileInput.value = "";
    setLoading(true);

    try {
      let res;

      if (mode === "company" && selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("dev_prompt", devPrompt);
        formData.append("user_prompt", typedMessage);

        res = await fetch("http://localhost:8000/analyze-resume", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("http://localhost:8000/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: typedMessage,
            mode,
            chat_id: chatId,
            dev_prompt: devPrompt,
          }),
        });
      }

      const data = await res.json();
      const rawReply = data.reply || data.result || "No response received.";

      const botMsg = {
        sender: "bot",
        text: normalizeBotText(rawReply),
      };

      setMessages((prev) => {
        const updated = [...prev, botMsg];
        updateChatMessages(chatId, updated);
        return updated;
      });
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
    setInput("");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || loading) return;

    setAttachedFile(file);
  };

  return (
    <div className={`app ${mode}`}>
      <div className="sidebar">
        <button className="newChatBtn" onClick={newChat}>
          + New Chat
        </button>

        <div className="history">
          {Object.keys(chats).map((id) =>
            chats[id]?.length ? (
              <div key={id} className="historyItem">
                <span onClick={() => loadChat(id)}>
                  {chats[id][0].text.slice(0, 25)}...
                </span>
                <button onClick={() => deleteChat(id)}>×</button>
              </div>
            ) : null,
          )}
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <span className="title">
            {mode === "general" ? "General AI" : "Company AI"}
          </span>

          <div className="topRight">
            {mode === "company" && (
              <button className="devBtn" onClick={() => setShowPromptBox(true)}>
                Dev Prompt
              </button>
            )}

            <div
              className={`toggleSwitch ${mode === "company" ? "active" : ""}`}
              onClick={() =>
                setMode((prev) => (prev === "general" ? "company" : "general"))
              }
            >
              <div className="toggleCircle"></div>
            </div>
          </div>
        </div>

        <div className="chat">
          {messages.map((msg, i) => (
            <div key={i} className={`row ${msg.sender}`}>
              <div className="messageStack">
                {msg.attachment?.name && (
                  <div className="attachmentBubble">
                    <span className="attachmentBubbleName">
                      {msg.attachment.name}
                    </span>
                  </div>
                )}

                {!!msg.text && (
                  <div className="bubble">{renderFormattedText(msg.text)}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="inputBox">
          {mode === "company" && attachedFile && (
            <div className="attachmentChip">
              <span className="attachmentName">{attachedFile.name}</span>
              <button
                type="button"
                className="removeAttachmentBtn"
                onClick={() => {
                  setAttachedFile(null);
                  const fileInput = document.getElementById("fileInput");
                  if (fileInput) fileInput.value = "";
                }}
                disabled={loading}
              >
                x
              </button>
            </div>
          )}

          {mode === "company" && (
            <>
              <button
                className="attachBtn"
                onClick={() => document.getElementById("fileInput").click()}
              >
                +
              </button>

              <input
                id="fileInput"
                type="file"
                hidden
                onChange={handleFileUpload}
              />
            </>
          )}

          <input
            value={input}
            disabled={loading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
          />

          <button
            onClick={sendMessage}
            className="sendBtn"
            disabled={loading || !input.trim()}
          >
            ➤
          </button>
        </div>
      </div>

      {showPromptBox && (
        <div className="modal" onClick={() => setShowPromptBox(false)}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <h3>Developer Prompt</h3>

            <textarea
              value={devPrompt}
              onChange={(e) => setDevPrompt(e.target.value)}
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
