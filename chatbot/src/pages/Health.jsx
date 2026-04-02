import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_FORM = {
  age: "",
  weight: "",
  goal: "weight loss",
  activityLevel: "",
};

const normalizeList = (value) => {
  if (!value) return [];

  return `${value}`
    .split(/\n|\u2022|-|\d+\./)
    .map((item) => item.trim())
    .filter(Boolean);
};

const SECTION_LABELS = [
  "User Analysis",
  "Workout Plan",
  "Diet Plan",
  "Health Tips",
];

const cleanSectionText = (value) => {
  return `${value || ""}`
    .replace(/^\s*\*+\s*/g, "")
    .replace(/\s*\*+\s*$/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const hasContent = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  return `${value || ""}`.trim().length > 0;
};

const escapeRegExp = (value) => {
  return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const extractSectionFromText = (text, name, nextHeaders = []) => {
  const heading = `(?:\\*\\*\\s*)?${escapeRegExp(name)}(?:\\s*\\*\\*)?\\s*:`;
  const nextPattern = nextHeaders
    .map(
      (header) => `(?:\\*\\*\\s*)?${escapeRegExp(header)}(?:\\s*\\*\\*)?\\s*:`,
    )
    .join("|");

  const pattern = nextPattern
    ? new RegExp(`${heading}\\s*([\\s\\S]*?)(?=${nextPattern}|$)`, "i")
    : new RegExp(`${heading}\\s*([\\s\\S]*?)$`, "i");

  const matched = text.match(pattern);
  return matched ? matched[1].trim() : "";
};

const extractSections = (rawText) => {
  const text = `${rawText || ""}`.replace(/\r/g, "");
  const headerPattern =
    /(?:^|\n)\s*(?:\*\*\s*)?(User Analysis|Workout Plan|Diet Plan|Health Tips)(?:\s*\*\*)?\s*:?(?=\s|\n|$)/gi;
  const hits = [];

  for (const match of text.matchAll(headerPattern)) {
    hits.push({
      label: `${match[1]}`.toLowerCase(),
      contentStart: (match.index ?? 0) + match[0].length,
      headerIndex: match.index ?? 0,
    });
  }

  if (!hits.length) {
    return {
      user_analysis: "",
      workout_plan: "",
      diet_plan: "",
      health_tips: "",
    };
  }

  const mapped = {
    user_analysis: "",
    workout_plan: "",
    diet_plan: "",
    health_tips: "",
  };

  for (let i = 0; i < hits.length; i += 1) {
    const current = hits[i];
    const nextHeaderIndex =
      i + 1 < hits.length ? hits[i + 1].headerIndex : text.length;
    const sectionText = cleanSectionText(
      text.slice(current.contentStart, nextHeaderIndex),
    );

    if (current.label === "user analysis") mapped.user_analysis = sectionText;
    if (current.label === "workout plan") mapped.workout_plan = sectionText;
    if (current.label === "diet plan") mapped.diet_plan = sectionText;
    if (current.label === "health tips") mapped.health_tips = sectionText;
  }

  return mapped;
};

const parseStructuredHealthReply = (raw, structured) => {
  const text = `${raw || ""}`.trim();
  const extracted = extractSections(text);

  const parsedFromRaw = {
    userAnalysis:
      extracted.user_analysis ||
      extractSectionFromText(text, "User Analysis", SECTION_LABELS.slice(1)),
    workoutPlan:
      extracted.workout_plan ||
      extractSectionFromText(text, "Workout Plan", [
        "Diet Plan",
        "Health Tips",
      ]),
    dietPlan:
      extracted.diet_plan ||
      extractSectionFromText(text, "Diet Plan", ["Health Tips"]),
    healthTips: normalizeList(
      extracted.health_tips || extractSectionFromText(text, "Health Tips"),
    ),
  };

  const backendStructured =
    structured && typeof structured === "object"
      ? {
          userAnalysis: `${structured.user_analysis || ""}`.trim(),
          workoutPlan: `${structured.workout_plan || ""}`.trim(),
          dietPlan: `${structured.diet_plan || ""}`.trim(),
          healthTips: normalizeList(structured.health_tips),
        }
      : null;

  const userAnalysis = hasContent(backendStructured?.userAnalysis)
    ? backendStructured.userAnalysis
    : parsedFromRaw.userAnalysis;
  const workoutPlan = hasContent(backendStructured?.workoutPlan)
    ? backendStructured.workoutPlan
    : parsedFromRaw.workoutPlan;
  const dietPlan = hasContent(backendStructured?.dietPlan)
    ? backendStructured.dietPlan
    : parsedFromRaw.dietPlan;
  const healthTips = hasContent(backendStructured?.healthTips)
    ? backendStructured.healthTips
    : parsedFromRaw.healthTips;

  return {
    userAnalysis: cleanSectionText(userAnalysis) || "No analysis available.",
    workoutPlan: cleanSectionText(workoutPlan) || "No workout plan available.",
    dietPlan: cleanSectionText(dietPlan) || "No diet plan available.",
    healthTips,
  };
};

function Health({ onExit }) {
  const [age, setAge] = useState(DEFAULT_FORM.age);
  const [weight, setWeight] = useState(DEFAULT_FORM.weight);
  const [goal, setGoal] = useState(DEFAULT_FORM.goal);
  const [activityLevel, setActivityLevel] = useState(
    DEFAULT_FORM.activityLevel,
  );
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [savedPlans, setSavedPlans] = useState([]);

  const chatBodyRef = useRef(null);
  const sessionIdRef = useRef(
    `health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );

  const healthDataPayload = useMemo(
    () => ({
      age: Number(age),
      weight: Number(weight),
      goal,
      activity_level: activityLevel || undefined,
    }),
    [age, weight, goal, activityLevel],
  );

  useEffect(() => {
    if (!chatBodyRef.current) return;
    chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
  }, [messages, loading]);

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, message]);
  };

  const validateInput = () => {
    if (!age || !weight || !goal) {
      return "Age, weight, and goal are required.";
    }

    if (Number(age) <= 0 || Number(weight) <= 0) {
      return "Age and weight must be greater than 0.";
    }

    if (!chatInput.trim()) {
      return "Please enter your health question or request.";
    }

    return "";
  };

  const sendToHealthApi = async (message) => {
    const response = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        role: "health",
        chat_id: sessionIdRef.current,
        health_data: healthDataPayload,
      }),
    });

    if (!response.ok) {
      throw new Error(`Health request failed with status ${response.status}`);
    }

    return response.json();
  };

  const handleSend = async () => {
    if (loading) return;

    const error = validateInput();
    setValidationError(error);

    if (error) return;

    const userMessage = chatInput.trim();
    appendMessage({ sender: "user", text: userMessage });
    setChatInput("");
    setLoading(true);

    try {
      const data = await sendToHealthApi(userMessage);
      const rawReply = data.reply || "No response received.";
      const structured = parseStructuredHealthReply(rawReply, data.structured);

      appendMessage({
        sender: "bot",
        text: rawReply,
        structured,
      });

      setSavedPlans((prev) => [structured, ...prev].slice(0, 10));
    } catch {
      appendMessage({
        sender: "bot",
        text: "Unable to generate your fitness plan right now. Please retry.",
        structured: {
          userAnalysis: "Response unavailable.",
          workoutPlan: "No workout plan generated.",
          dietPlan: "No diet plan generated.",
          healthTips: ["Check backend server availability and retry."],
        },
      });
    }

    setLoading(false);
  };

  const handleReset = () => {
    setAge(DEFAULT_FORM.age);
    setWeight(DEFAULT_FORM.weight);
    setGoal(DEFAULT_FORM.goal);
    setActivityLevel(DEFAULT_FORM.activityLevel);
    setMessages([]);
    setChatInput("");
    setValidationError("");
    setLoading(false);
    setSavedPlans([]);
    sessionIdRef.current = `health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  return (
    <div className="healthPage">
      <style>{`
        .healthPage {
          min-height: 100vh;
          padding: clamp(16px, 3vw, 28px);
          background:
            radial-gradient(circle at 12% 15%, #dff8ec 0%, transparent 33%),
            radial-gradient(circle at 86% 18%, #fff5df 0%, transparent 30%),
            linear-gradient(160deg, #f8fdfb 0%, #edf7f2 48%, #f7fbff 100%);
          font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif;
          color: #1d2a2a;
        }

        .healthShell {
          width: min(1100px, 100%);
          margin: 0 auto;
          display: grid;
          gap: 14px;
        }

        .healthTopbar {
          min-height: 62px;
          border-radius: 14px;
          border: 1px solid #cfe7dc;
          background: #ffffff;
          padding: 0 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 10px 24px rgba(28, 58, 47, 0.08);
        }

        .healthTopbar h2 {
          margin: 0;
          color: #1f513f;
        }

        .healthTopbarActions {
          display: flex;
          gap: 8px;
        }

        .healthBtn,
        .healthGhostBtn {
          min-height: 36px;
          border-radius: 10px;
          padding: 0 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .healthBtn {
          border: 1px solid #1f5d45;
          background: #1f5d45;
          color: #fff;
        }

        .healthBtn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .healthGhostBtn {
          border: 1px solid #c8ddd4;
          background: #fff;
          color: #285646;
        }

        .healthLayout {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 12px;
        }

        .healthFormCard,
        .healthChatCard {
          background: #fff;
          border: 1px solid #d8e9e1;
          border-radius: 16px;
          box-shadow: 0 12px 28px rgba(26, 59, 47, 0.08);
        }

        .healthFormCard {
          padding: 14px;
          display: grid;
          gap: 10px;
          align-content: start;
        }

        .healthFormCard h3 {
          margin: 0;
          color: #244f3f;
        }

        .healthFormCard label {
          display: grid;
          gap: 4px;
          font-size: 13px;
          font-weight: 600;
          color: #305647;
        }

        .healthFormCard input,
        .healthFormCard select {
          min-height: 38px;
          border-radius: 9px;
          border: 1px solid #d0e3da;
          padding: 0 10px;
          font: inherit;
          color: #25463b;
        }

        .healthError {
          margin: 0;
          font-size: 13px;
          color: #a53b3b;
        }

        .savedPlans {
          border-top: 1px dashed #d6e5de;
          margin-top: 4px;
          padding-top: 10px;
          display: grid;
          gap: 6px;
        }

        .savedPlansTitle {
          margin: 0;
          font-size: 13px;
          color: #406454;
          font-weight: 700;
        }

        .savedPlanItem {
          border: 1px solid #d9e9e2;
          border-radius: 9px;
          background: #f8fdfb;
          padding: 8px;
          font-size: 12px;
          color: #355749;
        }

        .healthChatCard {
          min-height: 560px;
          padding: 12px;
          display: grid;
          grid-template-rows: 1fr auto;
          gap: 10px;
        }

        .healthChatBody {
          overflow-y: auto;
          padding: 4px;
          display: grid;
          align-content: start;
          gap: 9px;
        }

        .healthRow {
          display: flex;
        }

        .healthRow.user {
          justify-content: flex-end;
        }

        .healthBubble {
          max-width: min(680px, 100%);
          border-radius: 12px;
          border: 1px solid #d5e5de;
          background: #f7fbf9;
          padding: 10px;
          white-space: pre-wrap;
          line-height: 1.4;
        }

        .healthRow.user .healthBubble {
          background: #e7f7ef;
          border-color: #c3e4d4;
        }

        .healthSections {
          margin-top: 8px;
          display: grid;
          gap: 8px;
        }

        .healthSection {
          border: 1px solid #d7e9e0;
          border-radius: 10px;
          background: #fff;
          padding: 8px;
        }

        .healthSectionTitle {
          margin: 0 0 4px;
          font-size: 13px;
          font-weight: 700;
          color: #25513f;
        }

        .healthSectionBody {
          margin: 0;
          white-space: pre-wrap;
          color: #2a4340;
          font-size: 14px;
        }

        .healthTipsList {
          margin: 0;
          padding-left: 18px;
          color: #2a4340;
        }

        .healthInputBar {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
        }

        .healthInputBar input {
          min-height: 42px;
          border-radius: 10px;
          border: 1px solid #cfe3da;
          padding: 0 12px;
          font: inherit;
        }

        .healthLoading {
          font-size: 13px;
          color: #386d59;
          margin: 0;
        }

        @media (max-width: 980px) {
          .healthLayout {
            grid-template-columns: 1fr;
          }

          .healthChatCard {
            min-height: 500px;
          }
        }
      `}</style>

      <div className="healthShell">
        <header className="healthTopbar">
          <h2>Health AI</h2>
          <div className="healthTopbarActions">
            <button type="button" className="healthGhostBtn" onClick={onExit}>
              Switch Mode
            </button>
            <button
              type="button"
              className="healthGhostBtn"
              onClick={handleReset}
            >
              Clear / Reset
            </button>
          </div>
        </header>

        <div className="healthLayout">
          <section className="healthFormCard">
            <h3>Health Profile</h3>

            <label>
              Age
              <input
                type="number"
                min="1"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                disabled={loading}
              />
            </label>

            <label>
              Weight (kg)
              <input
                type="number"
                min="1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                disabled={loading}
              />
            </label>

            <label>
              Goal
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                disabled={loading}
              >
                <option value="weight loss">weight loss</option>
                <option value="muscle gain">muscle gain</option>
                <option value="maintenance">maintenance</option>
              </select>
            </label>

            <label>
              Activity Level (optional)
              <select
                value={activityLevel}
                onChange={(e) => setActivityLevel(e.target.value)}
                disabled={loading}
              >
                <option value="">Not specified</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>

            {validationError && (
              <p className="healthError">{validationError}</p>
            )}

            <div className="savedPlans">
              <p className="savedPlansTitle">Previous Plans (session)</p>
              {savedPlans.length ? (
                savedPlans.slice(0, 4).map((plan, index) => (
                  <div key={`saved-plan-${index}`} className="savedPlanItem">
                    {plan.userAnalysis}
                  </div>
                ))
              ) : (
                <div className="savedPlanItem">No plans generated yet.</div>
              )}
            </div>
          </section>

          <section className="healthChatCard">
            <div className="healthChatBody" ref={chatBodyRef}>
              {messages.map((msg, index) => (
                <div
                  key={`health-msg-${index}`}
                  className={`healthRow ${msg.sender}`}
                >
                  <div className="healthBubble">
                    {(msg.sender === "user" || !msg.structured) && msg.text}

                    {msg.sender === "bot" && msg.structured && (
                      <div className="healthSections">
                        <div className="healthSection">
                          <p className="healthSectionTitle">User Analysis</p>
                          <p className="healthSectionBody">
                            {msg.structured.userAnalysis}
                          </p>
                        </div>

                        <div className="healthSection">
                          <p className="healthSectionTitle">Workout Plan</p>
                          <p className="healthSectionBody">
                            {msg.structured.workoutPlan}
                          </p>
                        </div>

                        <div className="healthSection">
                          <p className="healthSectionTitle">Diet Plan</p>
                          <p className="healthSectionBody">
                            {msg.structured.dietPlan}
                          </p>
                        </div>

                        <div className="healthSection">
                          <p className="healthSectionTitle">Health Tips</p>
                          {msg.structured.healthTips.length ? (
                            <ul className="healthTipsList">
                              {msg.structured.healthTips.map(
                                (tip, tipIndex) => (
                                  <li key={`tip-${index}-${tipIndex}`}>
                                    {tip}
                                  </li>
                                ),
                              )}
                            </ul>
                          ) : (
                            <p className="healthSectionBody">
                              No tips available.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <p className="healthLoading">Generating your fitness plan...</p>
              )}
            </div>

            <div>
              <div className="healthInputBar">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={loading}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask for a workout, diet, or healthy routine..."
                />
                <button
                  type="button"
                  className="healthBtn"
                  onClick={handleSend}
                  disabled={loading || !chatInput.trim()}
                >
                  Send
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Health;
