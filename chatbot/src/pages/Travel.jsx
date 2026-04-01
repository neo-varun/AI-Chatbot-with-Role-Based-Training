import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_FORM = {
  budget: "",
  days: "",
  location: "",
  interests: "",
};

// Utility to remove markdown formatting
const cleanMarkdown = (text) => {
  if (!text) return text;
  return `${text}`
    .replace(/\*\*(.*?)\*\*/g, "$1") // Remove **bold**
    .replace(/__(.*?)__/g, "$1") // Remove __bold__
    .replace(/\*(.*?)\*/g, "$1") // Remove *italic*
    .replace(/_(.*?)_/g, "$1"); // Remove _italic_
};

const normalizeWrappedLines = (text) => {
  if (!text) return "";

  // Join soft-wrapped lines (e.g. "budget\nfriendly") but keep section boundaries.
  return `${text}`
    .replace(/\r/g, "")
    .replace(/\n(?=[a-z0-9])/g, " ")
    .replace(/\n\s+(?=[a-z0-9])/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

const splitBudgetItems = (budgetText) => {
  const normalized = normalizeWrappedLines(budgetText);
  if (!normalized) return [];

  // Convert inline bullets to line boundaries, then split on known budget labels.
  let working = normalized
    .replace(/\s*[•*]\s*/g, "\n")
    .replace(/\s+-\s+(?=(?:travel|stay|food|activities|total)\s*:)/gi, "\n");

  // If labels are still inline without bullets/newlines, force a split before each label.
  working = working.replace(
    /\s+(?=(?:travel|stay|food|activities|total)\s*:)/gi,
    "\n",
  );

  const chunks = working
    .split(/\n+/)
    .map((item) => cleanMarkdown(item.trim()))
    .filter((item) => /^(travel|stay|food|activities|total)\s*:/i.test(item));

  if (chunks.length > 0) return chunks;

  return working
    .split(/[-•*]/)
    .map((item) => cleanMarkdown(item.trim()))
    .filter(Boolean);
};

const splitSuggestionItems = (suggestionsText) => {
  const normalized = normalizeWrappedLines(suggestionsText).replace(
    /^\s*(?:and\s+)?tips?\s*:\s*/i,
    "",
  );
  if (!normalized) return [];

  const stripLeadingBullet = (value) =>
    cleanMarkdown(value)
      .replace(/^\s*(?:[-•*]|\d+\.)\s*/, "")
      .trim();

  const bulletItems = normalized
    .split(/\n\s*(?:[-•*]|\d+\.)\s*/)
    .map((item) => stripLeadingBullet(item))
    .filter(Boolean);

  if (bulletItems.length > 1) return bulletItems;

  // Fallback: split by complete sentences when bullets are not present.
  const sentenceItems = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((item) => stripLeadingBullet(item))
    .filter(Boolean);

  return sentenceItems.length > 0
    ? sentenceItems
    : [stripLeadingBullet(normalized)];
};

const parseStructuredTravelReply = (raw) => {
  try {
    if (!raw) {
      return {
        overview: "No overview available.",
        itinerary: [],
        budgetBreakdown: [],
        suggestions: [],
      };
    }

    const text = `${raw}`.trim();

    // Remove markdown bold formatting
    const cleanText = text.replace(/\*\*(.*?)\*\*/g, "$1");

    // Extract Destination Overview
    const overviewMatch = cleanText.match(
      /destination\s*overview\s*:\s*([\s\S]*?)(?:day-wise\s*itinerary|estimated\s*budget|suggestions|$)/i,
    );
    const overview = overviewMatch ? overviewMatch[1].trim() : "";

    // Extract Day-wise Itinerary
    const itineraryMatch = cleanText.match(
      /day-wise\s*itinerary\s*:\s*([\s\S]*?)(?:estimated\s*budget|suggestions|$)/i,
    );
    const itineraryText = itineraryMatch ? itineraryMatch[1].trim() : "";

    // Parse itinerary with support for Day X: and Morning/Afternoon/Evening
    const itinerary = [];

    // Split by day blocks
    const dayMatches = [
      ...itineraryText.matchAll(
        /day\s+(\d+)\s*:\s*([\s\S]*?)(?=day\s+\d+|$)/gi,
      ),
    ];

    for (const match of dayMatches) {
      const dayNum = parseInt(match[1]);
      const dayContent = match[2].trim();

      const dayData = { day: dayNum, periods: [] };

      // Check if content has Morning/Afternoon/Evening sections
      const periodPatterns =
        /^(morning|afternoon|evening)\s*:\s*([\s\S]*?)(?=morning|afternoon|evening|$)/gim;
      const periodMatches = [...dayContent.matchAll(periodPatterns)];

      if (periodMatches.length > 0) {
        // Has explicit periods
        for (const periodMatch of periodMatches) {
          const periodName =
            periodMatch[1].charAt(0).toUpperCase() + periodMatch[1].slice(1);
          const periodText = periodMatch[2].trim();
          const items = periodText
            .split(/[-•*\n]/)
            .map((item) => cleanMarkdown(item.trim()))
            .filter((item) => item && !item.match(/^activities?\s*:\s*$/i));

          if (items.length > 0) {
            dayData.periods.push({
              period: periodName,
              items,
            });
          }
        }
      } else {
        // No explicit periods, treat all as activities
        const items = dayContent
          .replace(/activities?\s*:\s*/i, "") // Remove "Activities:" label
          .split(/[-•*\n]/)
          .map((item) => cleanMarkdown(item.trim()))
          .filter(Boolean);

        if (items.length > 0) {
          dayData.periods.push({
            period: "Activities",
            items,
          });
        }
      }

      if (dayData.periods.length > 0) {
        itinerary.push(dayData);
      }
    }

    // Extract Budget Breakdown
    const budgetMatch = cleanText.match(
      /estimated\s*budget\s*breakdown\s*:?\s*([\s\S]*?)(?=\n\s*(?:suggestions?\s*(?:&\s*tips?)?|tips?)\s*:?|$)/i,
    );
    const budgetText = budgetMatch ? budgetMatch[1].trim() : "";
    const budgetBreakdown = splitBudgetItems(budgetText).filter(
      (item) =>
        item && !item.match(/^(budget\s*breakdown|break\s*down)\s*:\s*$/i),
    );

    // Extract Suggestions
    const suggestionsMatch = cleanText.match(
      /(?:suggestions?(?:\s*&\s*tips?|\s*\n\s*and\s*tips?)?|tips?)\s*:?\s*([\s\S]*?)$/i,
    );
    const suggestionsText = suggestionsMatch ? suggestionsMatch[1].trim() : "";
    const suggestions = splitSuggestionItems(suggestionsText).filter(
      (item) =>
        item &&
        !item.match(/^suggestions?\s*(?:&\s*tips?)?\s*:?\s*$/i) &&
        !item.match(/^tips?\s*:?\s*$/i),
    );

    return {
      overview: cleanMarkdown(overview),
      itinerary,
      budgetBreakdown,
      suggestions,
    };
  } catch (error) {
    console.error("Parse error:", error);
    return {
      overview: "Unable to parse response",
      itinerary: [],
      budgetBreakdown: [],
      suggestions: [],
    };
  }
};

function Travel({ onExit }) {
  const [budget, setBudget] = useState(DEFAULT_FORM.budget);
  const [days, setDays] = useState(DEFAULT_FORM.days);
  const [location, setLocation] = useState(DEFAULT_FORM.location);
  const [interests, setInterests] = useState(DEFAULT_FORM.interests);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [planReady, setPlanReady] = useState(false);

  const chatBodyRef = useRef(null);
  const sessionIdRef = useRef(
    `travel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );

  const numericBudget = Number(budget) || 0;
  const numericDays = Number(days) || 0;

  const travelDataPayload = useMemo(
    () => ({
      budget: Number(budget),
      days: Number(days),
      location,
      interests,
    }),
    [budget, days, location, interests],
  );

  useEffect(() => {
    if (!chatBodyRef.current) return;
    chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
  }, [messages, loading]);

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, message]);
  };

  const validateForm = () => {
    if (!budget || !days || !location || !interests) {
      return "Please complete all travel fields before planning.";
    }

    if (Number(budget) <= 0 || Number(days) <= 0) {
      return "Budget and days must be greater than 0.";
    }

    return "";
  };

  const sendToTravelApi = async (message) => {
    try {
      console.log("Sending travel request:", {
        message,
        role: "travel",
        travel_data: travelDataPayload,
      });

      const response = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          role: "travel",
          chat_id: sessionIdRef.current,
          travel_data: travelDataPayload,
        }),
      });

      console.log("Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response:", errorText);
        throw new Error(
          `Travel request failed with status ${response.status}: ${errorText}`,
        );
      }

      const data = await response.json();
      console.log("API Response:", data);
      return data.reply || data.result || "No response received.";
    } catch (err) {
      console.error("sendToTravelApi error:", err);
      throw err;
    }
  };

  const handlePlanTrip = async () => {
    if (loading) return;

    const error = validateForm();
    setValidationError(error);

    if (error) return;

    console.log("Planning trip with:", {
      budget: numericBudget,
      days: numericDays,
      location,
      interests,
    });

    setLoading(true);

    const summaryMessage = [
      "Plan a trip for me with these details:",
      `Budget: ₹${numericBudget}`,
      `Days: ${numericDays}`,
      `Location: ${location}`,
      `Interests: ${interests}`,
      "Provide a detailed itinerary, budget breakdown, and travel tips.",
    ].join("\n");

    appendMessage({ sender: "user", text: "Plan my trip" });

    try {
      const rawReply = await sendToTravelApi(summaryMessage);
      const structured = parseStructuredTravelReply(rawReply);

      appendMessage({
        sender: "bot",
        text: rawReply,
        structured,
      });

      setPlanReady(true);
    } catch (error) {
      console.error("Travel API Error:", error);
      appendMessage({
        sender: "bot",
        text: `Error: ${error.message}. Backend may not be running.`,
        structured: {
          overview: "Could not create plan.",
          itinerary: [],
          budgetBreakdown: ["Backend API is unreachable."],
          suggestions: ["Restart backend and retry."],
        },
      });
    }

    setLoading(false);
  };

  const handleReset = () => {
    setBudget(DEFAULT_FORM.budget);
    setDays(DEFAULT_FORM.days);
    setLocation(DEFAULT_FORM.location);
    setInterests(DEFAULT_FORM.interests);
    setMessages([]);
    setChatInput("");
    setValidationError("");
    setLoading(false);
    setPlanReady(false);
    sessionIdRef.current = `travel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      const rawReply = await sendToTravelApi(message);
      const structured = parseStructuredTravelReply(rawReply);

      appendMessage({
        sender: "bot",
        text: rawReply,
        structured,
      });
    } catch (error) {
      console.error("Travel follow-up error:", error);
      appendMessage({
        sender: "bot",
        text: "Unable to send message right now. Please retry.",
        structured: {
          overview: "Response unavailable.",
          itinerary: [],
          budgetBreakdown: ["Request failed."],
          suggestions: ["Try sending again in a moment."],
        },
      });
    }

    setLoading(false);
  };

  return (
    <div className="travelPage">
      <header className="travelTopbar">
        <h2>Travel AI</h2>
        <button type="button" className="switchModeBtn" onClick={onExit}>
          Switch Mode
        </button>
      </header>

      <section className="travelFormCard">
        <h3>Trip Planning Inputs</h3>
        <div className="travelFormGrid">
          <label>
            Budget (₹)
            <input
              type="number"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              disabled={loading}
              placeholder="e.g., 50000"
            />
          </label>
          <label>
            Days
            <input
              type="number"
              min="1"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={loading}
              placeholder="e.g., 7"
            />
          </label>
          <label>
            Destination
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={loading}
              placeholder="e.g., Chennai, Bangalore"
            />
          </label>
          <label>
            Interests
            <input
              type="text"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              disabled={loading}
              placeholder="e.g., culture, food, adventure"
            />
          </label>
        </div>

        {validationError && <p className="errorMessage">{validationError}</p>}

        <div className="travelFormActions">
          <button
            type="button"
            className="primaryBtn"
            onClick={handlePlanTrip}
            disabled={loading}
          >
            {loading ? "Planning..." : "Plan Trip"}
          </button>
          <button
            type="button"
            className="ghostBtn"
            onClick={handleReset}
            disabled={loading}
          >
            Clear
          </button>
        </div>
      </section>

      <div className="chatContainer">
        <div className="chatBody" ref={chatBodyRef}>
          {messages.length === 0 && (
            <div className="emptyState">
              <p>
                Fill in your trip details and click "Plan Trip" to get started!
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`messageRow ${msg.sender}`}>
              <div className="messageStack">
                {msg.structured ? (
                  <div className="structuredResponse">
                    {msg.structured.overview && (
                      <div className="responseSection">
                        <h4>Destination Overview</h4>
                        <p>{msg.structured.overview}</p>
                      </div>
                    )}

                    {msg.structured.itinerary?.length > 0 && (
                      <div className="responseSection">
                        <h4>Day-wise Itinerary</h4>
                        {msg.structured.itinerary.map((dayData, dayIdx) => (
                          <div key={`day-${dayIdx}`} className="dayPlan">
                            <div className="dayHeader">
                              Day {dayData.day || dayIdx + 1}
                            </div>
                            {dayData.periods && dayData.periods.length > 0 ? (
                              <div className="dayPeriods">
                                {dayData.periods.map((period, periodIdx) => (
                                  <div
                                    key={`period-${dayIdx}-${periodIdx}`}
                                    className="periodBlock"
                                  >
                                    <div className="periodTitle">
                                      {period.period}
                                    </div>
                                    <ul className="periodItems">
                                      {period.items.map((item, itemIdx) => (
                                        <li
                                          key={`item-${dayIdx}-${periodIdx}-${itemIdx}`}
                                        >
                                          {item}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <ul className="dayActivities">
                                {(dayData.activities || []).map(
                                  (activity, actIdx) => (
                                    <li key={`activity-${dayIdx}-${actIdx}`}>
                                      {activity}
                                    </li>
                                  ),
                                )}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.structured.budgetBreakdown?.length > 0 && (
                      <div className="responseSection">
                        <h4>Estimated Budget Breakdown</h4>
                        <ul>
                          {msg.structured.budgetBreakdown.map((item, idx) => (
                            <li key={`budget-${idx}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {msg.structured.suggestions?.length > 0 && (
                      <div className="responseSection">
                        <h4>Suggestions & Tips</h4>
                        <ul>
                          {msg.structured.suggestions.map((tip, idx) => (
                            <li key={`tip-${idx}`}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bubble">{msg.text}</div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="loadingMessage">Planning your trip...</div>
          )}
        </div>

        {planReady && (
          <div className="followUpSection">
            <p className="followUpHint">
              Ask follow-up questions about your trip
            </p>
            <div className="inputBox">
              <input
                value={chatInput}
                disabled={loading}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="e.g., Suggest vegetarian restaurants..."
              />
              <button
                onClick={handleSend}
                className="sendBtn"
                disabled={loading || !chatInput.trim()}
              >
                ➤
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Travel;
