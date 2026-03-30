import { useEffect, useMemo, useRef, useState } from "react";

const TASK_META = {
  summarize: { label: "Summarize", title: "Summary", type: "summary" },
  generate_email: {
    label: "Generate Email",
    title: "Generated Email",
    type: "email",
  },
  create_todo: {
    label: "Create To-Do List",
    title: "To-Do List",
    type: "todo",
  },
  rewrite_text: {
    label: "Rewrite Text",
    title: "Rewritten Text",
    type: "rewrite",
  },
};

const normalizeDetectedTask = (value) => {
  const normalized = `${value || ""}`.trim().toLowerCase();
  if (normalized in TASK_META) return normalized;
  if (normalized.includes("summary") || normalized.includes("summarize"))
    return "summarize";
  if (normalized.includes("email")) return "generate_email";
  if (
    normalized.includes("todo") ||
    normalized.includes("to-do") ||
    normalized.includes("task")
  )
    return "create_todo";
  return "rewrite_text";
};

const splitList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => `${item}`.trim()).filter(Boolean);
  }

  return `${value}`
    .split(/\n|\u2022|-|\d+\./)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseStructuredResponse = (raw) => {
  const fallbackText = `${raw || ""}`.trim();
  let parsed = null;

  if (raw && typeof raw === "object") {
    parsed = raw;
  } else {
    const jsonBlock = fallbackText.match(/\{[\s\S]*\}/);
    if (jsonBlock) {
      try {
        parsed = JSON.parse(jsonBlock[0]);
      } catch {
        parsed = null;
      }
    }
  }

  const detectedTask = normalizeDetectedTask(
    parsed?.detected_task || parsed?.task_type || parsed?.task,
  );
  const meta = TASK_META[detectedTask];
  const result = parsed?.result ?? parsed?.output ?? parsed;

  if (detectedTask === "summarize") {
    const bullets = splitList(
      result?.bullets || result?.summary || result || fallbackText,
    );
    return {
      detectedTask,
      type: meta.type,
      title: meta.title,
      bullets: bullets.length ? bullets : ["No summary generated."],
      raw: fallbackText,
    };
  }

  if (detectedTask === "generate_email") {
    const text = `${result?.body || result || fallbackText}`.trim();
    const subject = `${result?.subject || ""}`.trim();
    const subjectMatch = !subject
      ? text.match(/subject\s*:\s*([^\n]+)/i)
      : null;
    const bodyMatch = !result?.body
      ? text.match(/body\s*:\s*([\s\S]*)/i)
      : null;

    return {
      detectedTask,
      type: meta.type,
      title: meta.title,
      subject:
        subject ||
        (subjectMatch ? subjectMatch[1].trim() : "Suggested subject"),
      body: result?.body
        ? `${result.body}`.trim()
        : bodyMatch
          ? bodyMatch[1].trim()
          : text || "No email body generated.",
      raw: fallbackText,
    };
  }

  if (detectedTask === "create_todo") {
    const items = splitList(
      result?.items || result?.todos || result || fallbackText,
    );
    return {
      detectedTask,
      type: meta.type,
      title: meta.title,
      items: items.length ? items : ["No tasks generated."],
      raw: fallbackText,
    };
  }

  return {
    detectedTask,
    type: meta.type,
    title: meta.title,
    text:
      `${result?.text || result || fallbackText}`.trim() ||
      "No rewritten text generated.",
    raw: fallbackText,
  };
};

const createAutoTaskPrompt = (input) => {
  return [
    "You are the Workflow Automation Assistant.",
    "First, detect the single best task for the input. Then complete that task.",
    "Allowed detected_task values only: summarize, generate_email, create_todo, rewrite_text.",
    "Return strict JSON only. No markdown, no code fences, no extra commentary.",
    "Output schema:",
    '{"detected_task":"summarize|generate_email|create_todo|rewrite_text","result":{...}}',
    "Required result format by detected_task:",
    '- summarize -> {"bullets": ["point 1", "point 2"]}',
    '- generate_email -> {"subject":"...","body":"..."}',
    '- create_todo -> {"items": ["task 1", "task 2"]}',
    '- rewrite_text -> {"text":"..."}',
    "If the request is ambiguous, choose the closest task and still return valid schema.",
    "User input:",
    input,
  ].join("\n\n");
};

function Workflow({ onExit }) {
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const outputRef = useRef(null);

  const canRun = useMemo(() => {
    return inputText.trim().length > 0 && !loading;
  }, [inputText, loading]);

  useEffect(() => {
    if (output && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [output]);

  const handleReset = () => {
    setInputText("");
    setOutput(null);
    setError("");
    setLoading(false);
  };

  const handleCopyOutput = async () => {
    if (!output) return;

    let plainText = "";

    if (output.type === "summary") {
      plainText = output.bullets.map((item) => `- ${item}`).join("\n");
    } else if (output.type === "email") {
      plainText = `Subject: ${output.subject}\n\nBody:\n${output.body}`;
    } else if (output.type === "todo") {
      plainText = output.items.map((item) => `- ${item}`).join("\n");
    } else {
      plainText = output.text;
    }

    try {
      await navigator.clipboard.writeText(plainText);
    } catch {
      // Clipboard may be unavailable in insecure contexts.
    }
  };

  const handleRunTask = async () => {
    if (!canRun) return;

    setLoading(true);
    setOutput(null);
    setError("");

    const prompt = createAutoTaskPrompt(inputText.trim());

    try {
      const response = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          role: "workflow",
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      const raw = data.reply || data.result || "";
      const structured = parseStructuredResponse(raw);
      setOutput(structured);
    } catch {
      setError(
        "Unable to process task right now. Please check backend and retry.",
      );
    }

    setLoading(false);
  };

  return (
    <div className="workflowPage">
      <style>{`
        .workflowPage {
          min-height: 100vh;
          padding: clamp(16px, 4vw, 32px);
          display: flex;
          justify-content: center;
          align-items: flex-start;
          background:
            radial-gradient(circle at 15% 12%, #d9f1ff 0%, transparent 30%),
            radial-gradient(circle at 85% 20%, #fff1d9 0%, transparent 32%),
            linear-gradient(165deg, #f8fbff 0%, #eef4fa 52%, #f6fafc 100%);
          font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif;
          color: #1a2432;
        }

        .workflowShell {
          width: min(920px, 100%);
          background: #ffffff;
          border: 1px solid #dbe6f0;
          border-radius: 22px;
          box-shadow: 0 18px 42px rgba(27, 46, 70, 0.12);
          padding: clamp(18px, 3vw, 30px);
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .workflowHeader {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .workflowHeaderText {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .workflowHeader h1 {
          margin: 0;
          font-size: clamp(24px, 4vw, 34px);
          color: #10233a;
          line-height: 1.15;
        }

        .workflowHeader p {
          margin: 0;
          color: #56708a;
          font-size: 15px;
        }

        .workflowGrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .workflowField {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .workflowLabel {
          font-size: 13px;
          font-weight: 700;
          color: #2a425c;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .workflowTextarea {
          width: 100%;
          border: 1px solid #d2deea;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 15px;
          color: #1a293b;
          background: #ffffff;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .workflowTextarea {
          min-height: 180px;
          resize: vertical;
          line-height: 1.55;
        }

        .workflowTextarea:focus {
          outline: none;
          border-color: #5f8ab4;
          box-shadow: 0 0 0 3px rgba(95, 138, 180, 0.18);
        }

        .workflowTextarea:disabled {
          background: #f4f7fa;
          color: #7f8f9f;
          cursor: not-allowed;
        }

        .workflowActions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .workflowButton {
          border: 0;
          border-radius: 10px;
          height: 42px;
          padding: 0 16px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.2s ease, background-color 0.2s ease;
        }

        .workflowButton:disabled {
          cursor: not-allowed;
          opacity: 0.6;
          transform: none;
          box-shadow: none;
        }

        .workflowButtonPrimary {
          background: #0f2f4f;
          color: #ffffff;
          box-shadow: 0 8px 18px rgba(18, 43, 68, 0.24);
        }

        .workflowButtonPrimary:hover:not(:disabled) {
          transform: translateY(-1px);
          background: #103a62;
        }

        .workflowButtonSecondary {
          background: #eef4fa;
          color: #20344b;
          border: 1px solid #d2deea;
        }

        .workflowButtonSecondary:hover:not(:disabled) {
          transform: translateY(-1px);
          background: #e4edf7;
        }

        .workflowProcessing {
          margin: 0;
          font-size: 14px;
          color: #496583;
          font-weight: 600;
        }

        .workflowError {
          margin: 0;
          color: #a02828;
          background: #ffecec;
          border: 1px solid #ffc6c6;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 14px;
        }

        .workflowOutputCard {
          border: 1px solid #dce8f3;
          border-radius: 16px;
          background: linear-gradient(160deg, #ffffff 0%, #f7fbff 100%);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: workflowFadeIn 0.25s ease;
        }

        @keyframes workflowFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .workflowOutputTop {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .workflowOutputTop h3 {
          margin: 0;
          font-size: 19px;
          color: #16304b;
        }

        .workflowTaskBadge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #365671;
          border: 1px solid #cfe0ee;
          background: #edf5fc;
          border-radius: 999px;
          padding: 5px 10px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          font-weight: 700;
        }

        .workflowList {
          margin: 0;
          padding-left: 20px;
          display: grid;
          gap: 8px;
          color: #24394e;
          line-height: 1.45;
        }

        .workflowEmailBlock {
          display: grid;
          gap: 10px;
        }

        .workflowEmailLabel {
          display: block;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #4e6c89;
          margin-bottom: 4px;
        }

        .workflowEmailValue,
        .workflowRewriteText {
          margin: 0;
          white-space: pre-wrap;
          color: #233a50;
          line-height: 1.55;
        }

        @media (max-width: 640px) {
          .workflowHeader {
            flex-direction: column;
          }

          .workflowShell {
            padding: 16px;
            border-radius: 18px;
          }

          .workflowOutputTop {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>

      <main className="workflowShell">
        <header className="workflowHeader">
          <div className="workflowHeaderText">
            <h1>Workflow AI</h1>
            <p>Automate tasks using AI</p>
          </div>
          {typeof onExit === "function" && (
            <button
              type="button"
              className="workflowButton workflowButtonSecondary"
              onClick={onExit}
            >
              Switch Mode
            </button>
          )}
        </header>

        <section className="workflowGrid" aria-label="workflow-task-form">
          <div className="workflowField">
            <label htmlFor="workflow-input" className="workflowLabel">
              Task Input
            </label>
            <textarea
              id="workflow-input"
              className="workflowTextarea"
              placeholder="Enter your task or paste text..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="workflowActions">
            <button
              type="button"
              className="workflowButton workflowButtonPrimary"
              onClick={handleRunTask}
              disabled={!canRun}
            >
              {loading ? "Processing..." : "Run Task"}
            </button>
            <button
              type="button"
              className="workflowButton workflowButtonSecondary"
              onClick={handleReset}
              disabled={loading && !inputText && !output}
            >
              Reset
            </button>
          </div>

          {loading && <p className="workflowProcessing">Processing...</p>}
          {error && <p className="workflowError">{error}</p>}
        </section>

        {output && (
          <section
            ref={outputRef}
            className="workflowOutputCard"
            aria-live="polite"
          >
            <div className="workflowOutputTop">
              <h3>{output.title}</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="workflowTaskBadge">
                  {TASK_META[output.detectedTask]?.label || "Detected Task"}
                </span>
                <button
                  type="button"
                  className="workflowButton workflowButtonSecondary"
                  style={{ height: 34, padding: "0 12px", fontSize: 13 }}
                  onClick={handleCopyOutput}
                >
                  Copy
                </button>
              </div>
            </div>

            {output.type === "summary" && (
              <ul className="workflowList">
                {output.bullets.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            )}

            {output.type === "email" && (
              <div className="workflowEmailBlock">
                <div>
                  <span className="workflowEmailLabel">Subject</span>
                  <p className="workflowEmailValue">{output.subject}</p>
                </div>
                <div>
                  <span className="workflowEmailLabel">Body</span>
                  <p className="workflowEmailValue">{output.body}</p>
                </div>
              </div>
            )}

            {output.type === "todo" && (
              <ol className="workflowList">
                {output.items.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ol>
            )}

            {output.type === "rewrite" && (
              <p className="workflowRewriteText">{output.text}</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default Workflow;
