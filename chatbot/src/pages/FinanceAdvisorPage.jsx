import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_FORM = {
  income: "",
  expenses: "",
  goal: "",
  timeline: "",
  goalType: "Travel",
};

const parseStructuredFinanceReply = (raw) => {
  if (!raw) {
    return {
      analysis: "No analysis available.",
      issues: [],
      suggestions: [],
      actionPlan: [],
    };
  }

  if (typeof raw === "object") {
    return {
      analysis: raw.analysis || "No analysis available.",
      issues: Array.isArray(raw.issues) ? raw.issues : [],
      suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : [],
      actionPlan: Array.isArray(raw.action_plan)
        ? raw.action_plan
        : Array.isArray(raw.actionPlan)
          ? raw.actionPlan
          : [],
    };
  }

  const text = `${raw}`.trim();
  const jsonBlock = text.match(/\{[\s\S]*\}/);

  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[0]);
      return {
        analysis: parsed.analysis || "No analysis available.",
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        actionPlan: Array.isArray(parsed.action_plan)
          ? parsed.action_plan
          : Array.isArray(parsed.actionPlan)
            ? parsed.actionPlan
            : [],
      };
    } catch {
      // Fallback to section parsing.
    }
  }

  const section = (name, next) => {
    const pattern = new RegExp(
      `${name}\\s*:\\s*([\\s\\S]*?)(?:${next.join("|")}|$)`,
      "i",
    );
    const matched = text.match(pattern);
    return matched ? matched[1].trim() : "";
  };

  const toList = (value) =>
    `${value || ""}`
      .split(/\n|\u2022|-|\d+\./)
      .map((item) => item.trim())
      .filter(Boolean);

  const analysis = section("analysis", ["issues\\s*:", "suggestions\\s*:", "action\\s*plan\\s*:"]);
  const issues = toList(
    section("issues", ["suggestions\\s*:", "action\\s*plan\\s*:"]),
  );
  const suggestions = toList(section("suggestions", ["action\\s*plan\\s*:"]));
  const actionPlan = toList(section("action\\s*plan", []));

  return {
    analysis: analysis || text,
    issues,
    suggestions,
    actionPlan,
  };
};

function FinanceAdvisorPage({ onExit }) {
  const [income, setIncome] = useState(DEFAULT_FORM.income);
  const [expenses, setExpenses] = useState(DEFAULT_FORM.expenses);
  const [goal, setGoal] = useState(DEFAULT_FORM.goal);
  const [timeline, setTimeline] = useState(DEFAULT_FORM.timeline);
  const [goalType, setGoalType] = useState(DEFAULT_FORM.goalType);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [analysisReady, setAnalysisReady] = useState(false);

  const chatBodyRef = useRef(null);
  const sessionIdRef = useRef(`finance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const numericIncome = Number(income) || 0;
  const numericExpenses = Number(expenses) || 0;
  const numericGoal = Number(goal) || 0;
  const numericTimeline = Number(timeline) || 0;

  const monthlySavings = Math.max(numericIncome - numericExpenses, 0);
  const projectedSavings = monthlySavings * numericTimeline;
  const savingsProgress = numericGoal > 0 ? Math.min((projectedSavings / numericGoal) * 100, 100) : 0;

  const budgetBreakdown = useMemo(() => {
    if (!numericIncome) {
      return { expenses: numericExpenses > 0 ? 100 : 0 };
    }

    return {
      expenses: Math.min((numericExpenses / numericIncome) * 100, 100),
    };
  }, [numericExpenses, numericIncome]);

  const financialDataPayload = useMemo(
    () => ({
      income: Number(income),
      expenses: Number(expenses),
      goal: Number(goal),
      timeline: Number(timeline),
      goal_type: goalType,
    }),
    [income, expenses, goal, timeline, goalType],
  );

  useEffect(() => {
    if (!chatBodyRef.current) return;
    chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
  }, [messages, loading]);

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, message]);
  };

  const validateForm = () => {
    if (!income || !expenses || !goal || !timeline || !goalType) {
      return "Please complete all financial fields before analyzing.";
    }

    if (
      Number(income) < 0 ||
      Number(expenses) < 0 ||
      Number(goal) < 0 ||
      Number(timeline) <= 0
    ) {
      return "Values must be non-negative, and timeline must be greater than 0.";
    }

    return "";
  };

  const sendToFinanceApi = async (message) => {
    const response = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        role: "finance",
        mode: "finance",
        chat_id: sessionIdRef.current,
        financial_data: financialDataPayload,
      }),
    });

    if (!response.ok) {
      throw new Error(`Finance request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.reply || data.result || "No response received.";
  };

  const handleAnalyze = async () => {
    if (loading) return;

    const error = validateForm();
    setValidationError(error);

    if (error) return;

    setLoading(true);

    const summaryMessage = [
      "Analyze my finances and return structured advice.",
      `Monthly income: ${numericIncome}`,
      `Monthly expenses: ${numericExpenses}`,
      `Savings goal: ${numericGoal}`,
      `Timeline in months: ${numericTimeline}`,
      `Goal type: ${goalType}`,
    ].join("\n");

    appendMessage({ sender: "user", text: "Analyze my financial plan." });

    try {
      const rawReply = await sendToFinanceApi(summaryMessage);
      const structured = parseStructuredFinanceReply(rawReply);

      appendMessage({
        sender: "bot",
        text: rawReply,
        structured,
      });

      setAnalysisReady(true);
    } catch {
      appendMessage({
        sender: "bot",
        text: "Unable to analyze right now. Make sure backend is running and try again.",
        structured: {
          analysis: "Could not complete analysis.",
          issues: ["Backend API is unreachable or returned an error."],
          suggestions: ["Restart backend server and retry Analyze."],
          actionPlan: ["Verify API on http://localhost:8000/chat"],
        },
      });
    }

    setLoading(false);
  };

  const handleReset = () => {
    setIncome(DEFAULT_FORM.income);
    setExpenses(DEFAULT_FORM.expenses);
    setGoal(DEFAULT_FORM.goal);
    setTimeline(DEFAULT_FORM.timeline);
    setGoalType(DEFAULT_FORM.goalType);
    setMessages([]);
    setChatInput("");
    setValidationError("");
    setLoading(false);
    setAnalysisReady(false);
    sessionIdRef.current = `finance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const handleSend = async () => {
    if (loading) return;

    const message = chatInput.trim();
    if (!message) return;

    appendMessage({ sender: "user", text: message });
    setChatInput("");
    setValidationError("");
    setLoading(true);

    try {
      const rawReply = await sendToFinanceApi(message);
      const structured = parseStructuredFinanceReply(rawReply);

      appendMessage({
        sender: "bot",
        text: rawReply,
        structured,
      });
    } catch {
      appendMessage({
        sender: "bot",
        text: "Unable to send message right now. Please retry.",
        structured: {
          analysis: "Response unavailable.",
          issues: ["Request failed."],
          suggestions: ["Try sending again in a moment."],
          actionPlan: [],
        },
      });
    }

    setLoading(false);
  };

  return (
    <div className="financePage">
      <header className="financeTopbar">
        <h2>Finance AI</h2>
        <button type="button" className="switchModeBtn" onClick={onExit}>
          Switch Mode
        </button>
      </header>

      <section className="financeFormCard">
        <h3>Financial Inputs</h3>
        <div className="financeFormGrid">
          <label>
            Monthly Income
            <input
              type="number"
              min="0"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Monthly Expenses
            <input
              type="number"
              min="0"
              value={expenses}
              onChange={(e) => setExpenses(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Savings Goal
            <input
              type="number"
              min="0"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Goal Type
            <select
              value={goalType}
              onChange={(e) => setGoalType(e.target.value)}
              disabled={loading}
            >
              <option>Travel</option>
              <option>House</option>
              <option>Emergency</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Timeline (months)
            <input
              type="number"
              min="1"
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              disabled={loading}
            />
          </label>
        </div>

        <div className="financeActions">
          <button
            type="button"
            className="primaryBtn"
            onClick={handleAnalyze}
            disabled={loading}
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
          <button
            type="button"
            className="ghostBtn"
            onClick={handleReset}
            disabled={loading}
          >
            Reset
          </button>
        </div>

        {!!validationError && <p className="financeError">{validationError}</p>}
      </section>

      <section className="financeSummaryCard">
        <h3>Summary Dashboard</h3>

        <div className="financeStatGrid">
          <article className="financeStat">
            <span>Income</span>
            <strong>₹{numericIncome.toLocaleString()}</strong>
          </article>
          <article className="financeStat">
            <span>Expenses</span>
            <strong>₹{numericExpenses.toLocaleString()}</strong>
          </article>
          <article className="financeStat">
            <span>Savings</span>
            <strong>₹{(numericIncome - numericExpenses).toLocaleString()}</strong>
          </article>
        </div>

        <div className="financeProgressWrap">
          <div className="financeProgressHeader">
            <span>Savings Progress</span>
            <strong className="financeProgressValue">
              {Math.round(savingsProgress)}%
            </strong>
          </div>
          <div className="financeProgressTrack">
            <div
              className="financeProgressFill"
              style={{ width: `${Math.max(0, Math.min(savingsProgress, 100))}%` }}
            />
          </div>
        </div>

        <div className="financeBudgetBreakdown">
          <h4>Budget Breakdown</h4>
          <div className="budgetRow">
            <span>Expenses</span>
            <div className="budgetTrack">
              <div
                className="budgetFill expenses"
                style={{ width: `${budgetBreakdown.expenses.toFixed(1)}%` }}
              />
            </div>
            <strong>{budgetBreakdown.expenses.toFixed(0)}%</strong>
          </div>
        </div>

        {analysisReady && numericExpenses > numericIncome && (
          <p className="financeWarning">
            Warning: Expenses are currently higher than income.
          </p>
        )}
      </section>

      <section className="financeChatCard">
        <h3>Finance Chat</h3>
        <div className="financeChatBody" ref={chatBodyRef}>
          {messages.map((msg, idx) => (
            <div key={`finance-msg-${idx}`} className={`row ${msg.sender}`}>
              <div className="messageStack financeMessageStack">
                {msg.sender === "bot" && msg.structured ? (
                  <div className="financeStructuredBubble">
                    <div className="financeStructuredBlock">
                      <h4>Analysis</h4>
                      <p>{msg.structured.analysis}</p>
                    </div>
                    <div className="financeStructuredBlock">
                      <h4>Issues</h4>
                      {msg.structured.issues.length > 0 ? (
                        <ul>
                          {msg.structured.issues.map((item, itemIdx) => (
                            <li key={`issue-${idx}-${itemIdx}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>No major issues detected.</p>
                      )}
                    </div>
                    <div className="financeStructuredBlock">
                      <h4>Suggestions</h4>
                      {msg.structured.suggestions.length > 0 ? (
                        <ul>
                          {msg.structured.suggestions.map((item, itemIdx) => (
                            <li key={`suggestion-${idx}-${itemIdx}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>No suggestions available.</p>
                      )}
                    </div>
                    <div className="financeStructuredBlock">
                      <h4>Action Plan</h4>
                      {msg.structured.actionPlan.length > 0 ? (
                        <ul>
                          {msg.structured.actionPlan.map((item, itemIdx) => (
                            <li key={`action-${idx}-${itemIdx}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>No action plan available.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bubble">{msg.text}</div>
                )}
              </div>
            </div>
          ))}

          {loading && <div className="evaluating">Analyzing...</div>}
        </div>

        <div className="financeChatInput">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={loading}
            placeholder="Ask follow-up questions about your plan..."
          />
          <button
            type="button"
            className="sendBtn"
            onClick={handleSend}
            disabled={loading || !chatInput.trim()}
          >
            Send
          </button>
        </div>
      </section>
    </div>
  );
}

export default FinanceAdvisorPage;
