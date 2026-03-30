import { useState, useEffect } from "react";
import "./App.css";
import FinanceAdvisorPage from "./pages/FinanceAdvisorPage";
import Workflow from "./pages/Workflow";

const modeCards = [
  {
    key: "general",
    title: "General AI",
    subtitle: "Fast brainstorming, drafting, and everyday questions.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a7 7 0 0 0-4 12.74V18a1 1 0 0 0 1 1h1v2h4v-2h1a1 1 0 0 0 1-1v-3.26A7 7 0 0 0 12 2Zm2.68 11.26A1 1 0 0 0 14 14v3h-4v-3a1 1 0 0 0-.68-.95 5 5 0 1 1 5.36 0Z" />
      </svg>
    ),
  },
  {
    key: "company",
    title: "Company AI",
    subtitle: "Recruiting and resume analysis with role-focused replies.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 3a2 2 0 0 0-2 2v1H4a2 2 0 0 0-2 2v3h20V8a2 2 0 0 0-2-2h-2V5a2 2 0 0 0-2-2H8Zm8 3H8V5h8v1Zm6 7H2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6Zm-8 2v2h-4v-2h4Z" />
      </svg>
    ),
  },
  {
    key: "interview",
    title: "Interview AI",
    subtitle: "Run realistic mock interviews with scoring and feedback.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h10a2 2 0 0 1 2 2v3h4a2 2 0 0 1 2 2v7h-2v-7h-4v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm1 2v12h9V6H5Zm2 2h5v2H7V8Zm0 4h5v2H7v-2Z" />
      </svg>
    ),
  },
  {
    key: "finance",
    title: "Finance AI",
    subtitle: "Plan budgets, track goals, and get structured financial advice.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v14h16V5H4Zm2 9h2a3 3 0 0 0 6 0v-1a3 3 0 1 0-6 0v1Zm2 0v-1a1 1 0 1 1 2 0v1a1 1 0 1 1-2 0Zm8-6h2v2h-2V8Z" />
      </svg>
    ),
  },
  {
    key: "workflow",
    title: "Workflow AI",
    subtitle: "Automate summaries, emails, rewrites, and to-do generation.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3h14a2 2 0 0 1 2 2v3h-2V5H5v14h5v2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm8 7h8v2h-8v-2Zm0 4h8v2h-8v-2Zm0 4h8v2h-8v-2Zm-2-7.5 1.4 1.4-3.9 3.9-2.4-2.4 1.4-1.4 1 1 2.5-2.5Z" />
      </svg>
    ),
  },
];

const normalizeList = (value) => {
  if (!value) return [];
  if (Array.isArray(value))
    return value.map((item) => `${item}`.trim()).filter(Boolean);
  return `${value}`
    .split(/\n|,|\u2022|-/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseInterviewReply = (raw) => {
  if (raw && typeof raw === "object") {
    return {
      score: Number(raw.score) || null,
      feedback: raw.feedback || raw.reply || "",
      improvements: normalizeList(raw.improvements || raw.improvement),
      nextQuestion:
        raw.nextQuestion ||
        raw.next_question ||
        raw.question ||
        raw.followUp ||
        "",
      strengths: normalizeList(raw.strengths),
      weaknesses: normalizeList(raw.weaknesses),
    };
  }

  const text = `${raw || ""}`.trim();

  const jsonBlock = text.match(/\{[\s\S]*\}/);

  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[0]);
      return {
        score: Number(parsed.score) || null,
        feedback: parsed.feedback || parsed.reply || text,
        improvements: normalizeList(parsed.improvements || parsed.improvement),
        nextQuestion:
          parsed.nextQuestion || parsed.next_question || parsed.question || "",
        strengths: normalizeList(parsed.strengths),
        weaknesses: normalizeList(parsed.weaknesses),
      };
    } catch {
      // Falls back to regex parsing below.
    }
  }

  const scoreMatch = text.match(/(\d{1,2})\s*\/\s*10/i);
  const feedbackMatch = text.match(
    /feedback\s*:\s*([\s\S]*?)(?:improvements?\s*:|next\s*question\s*:|strengths\s*:|weaknesses\s*:|$)/i,
  );
  const improvementMatch = text.match(
    /improvements?\s*:\s*([\s\S]*?)(?:next\s*question\s*:|strengths\s*:|weaknesses\s*:|$)/i,
  );
  const nextQuestionMatch = text.match(
    /next\s*question\s*:\s*([\s\S]*?)(?:strengths\s*:|weaknesses\s*:|$)/i,
  );
  const strengthsMatch = text.match(
    /strengths\s*:\s*([\s\S]*?)(?:weaknesses\s*:|$)/i,
  );
  const weaknessesMatch = text.match(/weaknesses\s*:\s*([\s\S]*?)$/i);

  return {
    score: scoreMatch ? Number(scoreMatch[1]) : null,
    feedback: feedbackMatch ? feedbackMatch[1].trim() : text,
    improvements: normalizeList(improvementMatch?.[1]),
    nextQuestion: nextQuestionMatch ? nextQuestionMatch[1].trim() : "",
    strengths: normalizeList(strengthsMatch?.[1]),
    weaknesses: normalizeList(weaknessesMatch?.[1]),
  };
};

const parseQuestionText = (raw) => {
  if (!raw) return "";
  if (typeof raw === "object") {
    return (
      raw.question ||
      raw.nextQuestion ||
      raw.next_question ||
      raw.reply ||
      ""
    ).trim();
  }

  const text = `${raw}`.trim();
  const questionMatch = text.match(/question\s*:\s*([\s\S]*)/i);
  return (questionMatch ? questionMatch[1] : text).trim();
};

function InterviewAssistant({ onExit }) {
  const [setup, setSetup] = useState({
    role: "Frontend",
    difficulty: "Medium",
    interviewType: "Technical",
    numberOfQuestions: 5,
  });
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [interviewSessionId, setInterviewSessionId] = useState("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [questionSlides, setQuestionSlides] = useState([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [scores, setScores] = useState([]);
  const [summaryStrengths, setSummaryStrengths] = useState([]);
  const [summaryWeaknesses, setSummaryWeaknesses] = useState([]);

  const restartInterview = () => {
    setStarted(false);
    setCompleted(false);
    setIsPreparing(false);
    setCurrentQuestionIndex(0);
    setTotalQuestions(Number(setup.numberOfQuestions));
    setQuestionSlides([]);
    setActiveSlideIndex(0);
    setDraftAnswer("");
    setScores([]);
    setSummaryStrengths([]);
    setSummaryWeaknesses([]);
    setInterviewSessionId("");
    setSetupError("");
  };

  const requestInterviewQuestion = async (sessionId, questionNumber, total) => {
    const questionPrompt = [
      `Generate interview question ${questionNumber} of ${total}.`,
      `Role: ${setup.role}`,
      `Difficulty: ${setup.difficulty}`,
      `Interview type: ${setup.interviewType}`,
      "Return only one concise question text, no labels.",
    ].join("\n");

    const res = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: questionPrompt,
        mode: "interview",
        chat_id: sessionId,
        dev_prompt:
          "You are an AI interviewer. Keep questions realistic, role-specific, and clear.",
      }),
    });

    if (!res.ok) {
      throw new Error(`Question request failed with status ${res.status}`);
    }

    const data = await res.json();
    return parseQuestionText(data.reply || data.result || data);
  };

  const startInterview = async () => {
    const sessionId = `${Date.now()}`;
    const questionsCount = Number(setup.numberOfQuestions);

    setIsPreparing(true);
    setSetupError("");

    try {
      const firstQuestion = await requestInterviewQuestion(
        sessionId,
        1,
        questionsCount,
      );

      if (!firstQuestion) {
        throw new Error("No question received from backend");
      }

      setInterviewSessionId(sessionId);
      setStarted(true);
      setCompleted(false);
      setCurrentQuestionIndex(0);
      setTotalQuestions(questionsCount);
      setQuestionSlides([
        {
          question: firstQuestion,
          answer: "",
          feedback: "",
          score: null,
          improvements: [],
        },
      ]);
      setActiveSlideIndex(0);
      setDraftAnswer("");
      setScores([]);
      setSummaryStrengths([]);
      setSummaryWeaknesses([]);
    } catch (error) {
      setSetupError(
        "Could not start interview. Ensure backend is running and try again.",
      );
    }

    setIsPreparing(false);
  };

  const handleSubmitAnswer = async () => {
    const activeSlide = questionSlides[activeSlideIndex];
    const userAnswer = draftAnswer.trim();
    const isLatestQuestion = activeSlideIndex === questionSlides.length - 1;
    const alreadyEvaluated = !!activeSlide?.feedback;

    if (
      !userAnswer ||
      isEvaluating ||
      completed ||
      !activeSlide ||
      !isLatestQuestion ||
      alreadyEvaluated
    ) {
      return;
    }

    setIsEvaluating(true);
    setQuestionSlides((prev) =>
      prev.map((slide, idx) =>
        idx === activeSlideIndex ? { ...slide, answer: userAnswer } : slide,
      ),
    );
    setDraftAnswer("");

    try {
      const res = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: [
            `Evaluate this answer for interview question ${currentQuestionIndex + 1} of ${totalQuestions}.`,
            `Role: ${setup.role}`,
            `Difficulty: ${setup.difficulty}`,
            `Interview type: ${setup.interviewType}`,
            `Question: ${activeSlide.question}`,
            `Candidate answer: ${userAnswer}`,
            "Respond in JSON with keys: score (0-10), feedback, improvements (array), nextQuestion (string), strengths (array), weaknesses (array).",
            "If there are no more questions, return nextQuestion as empty string.",
          ].join("\n"),
          mode: "interview",
          chat_id: interviewSessionId,
          dev_prompt:
            "You are an expert interviewer. Score strictly and provide practical improvements.",
        }),
      });

      if (!res.ok) {
        throw new Error(`Evaluation failed with status ${res.status}`);
      }

      const data = await res.json();
      const payload = parseInterviewReply(data.reply || data.result || data);

      const normalizedScore =
        typeof payload.score === "number"
          ? Math.max(0, Math.min(10, payload.score))
          : null;
      const feedbackObject = {
        score: normalizedScore,
        feedback: payload.feedback || "Feedback received.",
        improvements: payload.improvements,
      };

      setQuestionSlides((prev) =>
        prev.map((slide, idx) =>
          idx === activeSlideIndex ? { ...slide, ...feedbackObject } : slide,
        ),
      );

      if (typeof normalizedScore === "number") {
        setScores((prev) => [...prev, normalizedScore]);
      }

      setSummaryStrengths((prev) => {
        const combined = [...prev, ...payload.strengths];
        return [...new Set(combined)].slice(0, 5);
      });

      setSummaryWeaknesses((prev) => {
        const combined = [
          ...prev,
          ...payload.weaknesses,
          ...payload.improvements,
        ];
        return [...new Set(combined)].slice(0, 6);
      });

      const nextIndex = questionSlides.length;
      const isLastAnswered = nextIndex >= totalQuestions;

      if (isLastAnswered) {
        setCompleted(true);
      } else {
        let nextQuestion = payload.nextQuestion;

        if (!nextQuestion) {
          nextQuestion = await requestInterviewQuestion(
            interviewSessionId,
            nextIndex + 1,
            totalQuestions,
          );
        }

        setQuestionSlides((prev) => [
          ...prev,
          {
            question: nextQuestion,
            answer: "",
            feedback: "",
            score: null,
            improvements: [],
          },
        ]);
      }
    } catch (error) {
      setQuestionSlides((prev) =>
        prev.map((slide, idx) =>
          idx === activeSlideIndex
            ? {
                ...slide,
                feedback:
                  "Unable to evaluate the answer right now. Please try again.",
                improvements: ["Retry once the backend service is reachable."],
              }
            : slide,
        ),
      );
    }

    setIsEvaluating(false);
  };

  const activeSlide = questionSlides[activeSlideIndex] || null;
  const canGoPrev = activeSlideIndex > 0;
  const canGoNext = activeSlideIndex < questionSlides.length - 1;
  const isLatestQuestion = activeSlideIndex === questionSlides.length - 1;
  const isEditableSlide =
    isLatestQuestion && !completed && !activeSlide?.feedback;

  const goToPrevSlide = () => {
    if (!canGoPrev) return;
    const next = activeSlideIndex - 1;
    setActiveSlideIndex(next);
    setCurrentQuestionIndex(next);
    setDraftAnswer("");
  };

  const goToNextSlide = () => {
    if (!canGoNext) return;
    const next = activeSlideIndex + 1;
    setActiveSlideIndex(next);
    setCurrentQuestionIndex(next);
    setDraftAnswer(questionSlides[next]?.answer || "");
  };

  const averageScore = scores.length
    ? (scores.reduce((sum, val) => sum + val, 0) / scores.length).toFixed(1)
    : "-";

  return (
    <div className="interviewPage">
      {!started && (
        <div className="setupWrap">
          <div className="setupCard">
            <h2>Interview AI</h2>
            <p>
              Configure the interview and start your mock session with real-time
              evaluation.
            </p>

            <label>
              Role
              <select
                value={setup.role}
                onChange={(e) =>
                  setSetup((prev) => ({ ...prev, role: e.target.value }))
                }
              >
                <option>Frontend</option>
                <option>Backend</option>
                <option>ML</option>
              </select>
            </label>

            <label>
              Difficulty
              <select
                value={setup.difficulty}
                onChange={(e) =>
                  setSetup((prev) => ({ ...prev, difficulty: e.target.value }))
                }
              >
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
            </label>

            <label>
              Interview Type
              <select
                value={setup.interviewType}
                onChange={(e) =>
                  setSetup((prev) => ({
                    ...prev,
                    interviewType: e.target.value,
                  }))
                }
              >
                <option>Technical</option>
                <option>HR</option>
                <option>Mixed</option>
              </select>
            </label>

            <label>
              Number of Questions
              <select
                value={setup.numberOfQuestions}
                onChange={(e) =>
                  setSetup((prev) => ({
                    ...prev,
                    numberOfQuestions: Number(e.target.value),
                  }))
                }
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </label>

            <div className="setupActions">
              <button type="button" className="ghostBtn" onClick={onExit}>
                Back
              </button>
              <button
                type="button"
                className="primaryBtn"
                onClick={startInterview}
                disabled={isPreparing}
              >
                Start Interview
              </button>
            </div>

            {isPreparing && (
              <div className="evaluating">Preparing interview...</div>
            )}
            {!!setupError && <p className="setupError">{setupError}</p>}
          </div>
        </div>
      )}

      {started && (
        <div className="interviewShell">
          <div className="interviewTopbar">
            <div className="topbarMeta">Role: {setup.role}</div>
            <div className="topbarMeta">
              Q{Math.min(currentQuestionIndex + 1, totalQuestions)}/
              {totalQuestions}
            </div>
            <div className="topbarActions">
              <button type="button" className="ghostBtn" onClick={onExit}>
                Switch Mode
              </button>
              <button
                type="button"
                className="ghostBtn"
                onClick={restartInterview}
              >
                Reset
              </button>
            </div>
          </div>

          {!completed && (
            <>
              <div className="interviewDeck">
                <button
                  type="button"
                  className="slideNav left"
                  onClick={goToPrevSlide}
                  disabled={!canGoPrev}
                  aria-label="Previous question"
                >
                  {"<"}
                </button>

                <div className="questionSlide">
                  <div className="msgLabel">
                    Interviewer Question {activeSlideIndex + 1}
                  </div>
                  <div className="msgBody">
                    {activeSlide?.question || "Loading question..."}
                  </div>

                  {activeSlide?.answer && (
                    <div className="slideAnswer">
                      <div className="msgLabel">Your Submitted Answer</div>
                      <div className="msgBody">{activeSlide.answer}</div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="slideNav right"
                  onClick={goToNextSlide}
                  disabled={!canGoNext}
                  aria-label="Next question"
                >
                  {">"}
                </button>
              </div>

              <div className="answerSection">
                <textarea
                  value={
                    isEditableSlide ? draftAnswer : activeSlide?.answer || ""
                  }
                  onChange={(e) => setDraftAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  disabled={isEvaluating || !isEditableSlide}
                />
                <button
                  type="button"
                  className="primaryBtn"
                  onClick={handleSubmitAnswer}
                  disabled={
                    isEvaluating || !isEditableSlide || !draftAnswer.trim()
                  }
                >
                  Submit Answer
                </button>
                {!isEditableSlide && (
                  <p className="setupError">
                    Navigate to the latest question to submit your next answer.
                  </p>
                )}
              </div>

              {isEvaluating && <div className="evaluating">Evaluating...</div>}

              {!!activeSlide?.feedback && (
                <div className="feedbackCard">
                  <div className="feedbackHeader">
                    <span>Feedback for Question {activeSlideIndex + 1}</span>
                    {typeof activeSlide.score === "number" && (
                      <span className="scoreBadge">{activeSlide.score}/10</span>
                    )}
                  </div>
                  <p>{activeSlide.feedback}</p>
                  {activeSlide.improvements?.length > 0 && (
                    <ul className="improvementsList">
                      {activeSlide.improvements.map((point, idx) => (
                        <li
                          key={`slide-improvement-${activeSlideIndex}-${idx}`}
                        >
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}

          {completed && (
            <div className="summaryCard">
              <h3>Interview Summary</h3>
              <div className="summaryScore">
                Average Score: {averageScore}/10
              </div>

              <div className="summaryColumns">
                <div>
                  <h4>Strengths</h4>
                  <ul>
                    {summaryStrengths.length > 0 ? (
                      summaryStrengths.map((item, idx) => (
                        <li key={`strength-${idx}`}>{item}</li>
                      ))
                    ) : (
                      <li>No strengths recorded yet.</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h4>Weaknesses</h4>
                  <ul>
                    {summaryWeaknesses.length > 0 ? (
                      summaryWeaknesses.map((item, idx) => (
                        <li key={`weakness-${idx}`}>{item}</li>
                      ))
                    ) : (
                      <li>No weaknesses recorded yet.</li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="setupActions">
                <button type="button" className="ghostBtn" onClick={onExit}>
                  Switch Mode
                </button>
                <button
                  type="button"
                  className="primaryBtn"
                  onClick={restartInterview}
                >
                  Restart Interview
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  const [mode, setMode] = useState(null);
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

  if (!mode) {
    return (
      <div className="modePage">
        <div className="modeGlow modeGlowLeft" />
        <div className="modeGlow modeGlowRight" />

        <div className="modeShell">
          <span className="modeBadge">AI Workspace</span>
          <h1>Role Based AI Assistants</h1>
          <p>
            Got everyday questions? Need to hire talent? Want to ace your next
            interview? We've got an AI mode for that.
          </p>

          <div className="modeGrid">
            {modeCards.map((card) => (
              <button
                key={card.key}
                type="button"
                className={`modeCard ${card.key}`}
                onClick={() => setMode(card.key)}
              >
                <span className="modeCardIcon">{card.icon}</span>
                <span className="modeCardTitle">{card.title}</span>
                <span className="modeCardSubtitle">{card.subtitle}</span>
                <span className="modeCardAction">Enter Mode</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "interview") {
    return <InterviewAssistant onExit={() => setMode(null)} />;
  }

  if (mode === "finance") {
    return <FinanceAdvisorPage onExit={() => setMode(null)} />;
  }

  if (mode === "workflow") {
    return <Workflow onExit={() => setMode(null)} />;
  }

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

            <button className="switchModeBtn" onClick={() => setMode(null)}>
              Switch Mode
            </button>
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
