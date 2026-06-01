/**
 * @file components/AIChat.jsx
 * @description Free-tier AI Chat widget for NutriFit AI.
 *
 * Features:
 *   • Scrollable message history (user + AI bubbles)
 *   • Controlled input with Enter-key and button send
 *   • Typing indicator animation while awaiting AI response
 *   • POST /api/chat fetch call (backend to be wired later)
 *   • Auto-scrolls to the latest message on each update
 *
 * State:
 *   messages  — array of { role: "user"|"assistant", text: string }
 *   input     — current value of the text field
 *   isLoading — true while waiting for the AI response
 */

import { useState, useEffect, useRef } from "react";
import "./AIChat.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * getConsumerId — Reads the logged-in consumer's MongoDB _id from the
 * localStorage snapshot written at login time. Returns null if unavailable.
 * @returns {string|null}
 */
const getConsumerId = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user"));
    return user?._id ?? null;
  } catch {
    return null;
  }
};

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_MESSAGE = {
  role: "assistant",
  text: "Hi! I'm your NutriFit AI Advisor. Ask me anything about your diet plan, nutrition, or healthy eating habits!",
};

// ─── Sub-Components ───────────────────────────────────────────────────────────

/**
 * TypingIndicator — Animated dots shown while the AI is "thinking".
 */
const TypingIndicator = () => (
  <div className="aic-bubble aic-bubble--ai aic-bubble--typing" aria-label="AI is typing">
    <span className="aic-typing-dot" />
    <span className="aic-typing-dot" />
    <span className="aic-typing-dot" />
  </div>
);

/**
 * MessageBubble — A single chat message rendered as a styled bubble.
 */
const MessageBubble = ({ message }) => {
  const isUser = message.role === "user";
  return (
    <div className={`aic-message ${isUser ? "aic-message--user" : "aic-message--ai"}`}>
      <div className={`aic-bubble ${isUser ? "aic-bubble--user" : "aic-bubble--ai"}`}>
        {message.text}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AIChat = () => {
  const [messages,  setMessages]  = useState([INITIAL_MESSAGE]);
  const [input,     setInput]     = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef             = useRef(null);

  // Resolve once on mount — avoids calling localStorage on every send
  const consumerId = getConsumerId();

  // Auto-scroll to the latest message whenever the list changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  /**
   * handleSendMessage
   * 1. Appends the user message to state immediately
   * 2. Clears the input field
   * 3. Shows a typing indicator
   * 4. POSTs to /api/chat and appends the AI reply
   * 5. On error, appends a friendly error bubble
   */
  const handleSendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // 1. Append user message immediately
    const userMessage = { role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMessage]);

    // 2. Clear input
    setInput("");

    // 3. Show typing indicator
    setIsLoading(true);

    try {
      // POST to the live chatController endpoint.
      // Fields must match exactly what chatController.js extracts from req.body:
      //   consumerId   — used to fetch the active DietPlan for context
      //   userMessage  — the new message text
      //   chatHistory  — full conversation array (role + text) for Gemini memory
      const response = await fetch("/api/chat/send", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",  // send JWT cookie for future auth middleware
        body: JSON.stringify({
          consumerId,
          userMessage:  trimmed,
          chatHistory:  messages,  // full history so Gemini has full context
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      const data = await response.json();
      // Controller returns: { success: true, reply: string }
      const aiText = data.reply || "I received your message!";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: aiText },
      ]);
    } catch (error) {
      // Show a friendly error bubble instead of crashing
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "I'm having trouble connecting right now. The AI chat backend is being set up — please try again shortly!",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * handleKeyDown — Allow submitting with Enter (Shift+Enter = new line).
   */
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="aic-container" role="region" aria-label="NutriFit AI Chat">

      {/* ── Header ── */}
      <div className="aic-header">
        <div className="aic-header__left">
          <div>
            <p className="aic-header__name">NutriFit AI Advisor</p>
            <p className="aic-header__status">
              <span className="aic-status-dot" aria-hidden="true" />
              Free Tier · AI Powered
            </p>
          </div>
        </div>
        <span className="aic-header__badge">✦ Gemini</span>
      </div>

      {/* ── Message History ── */}
      <div
        className="aic-messages"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {/* Typing indicator */}
        {isLoading && <TypingIndicator />}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Free Tier Notice ── */}
      <div className="aic-tier-notice">
        Free Tier: AI nutrition chat included. PDF exports and human dietician chat are premium.
      </div>

      {/* ── Input Area ── */}
      <div className="aic-input-area">
        <textarea
          id="ai-chat-input"
          className="aic-input"
          rows={1}
          placeholder="Ask me about your diet, nutrition, or health goals…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          aria-label="Type your message"
          aria-multiline="false"
        />
        <button
          id="ai-chat-send-btn"
          className="aic-send-btn"
          onClick={handleSendMessage}
          disabled={isLoading || !input.trim()}
          aria-label="Send message"
        >
          {isLoading ? (
            <span className="aic-send-spinner" aria-hidden="true" />
          ) : (
            "✦ Ask"
          )}
        </button>
      </div>
    </div>
  );
};

export default AIChat;
