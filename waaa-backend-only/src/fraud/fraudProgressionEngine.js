/*
==============================================================================
WAAA — Fraud Progression Engine
==============================================================================
Analyses a FULL conversation arc (not a single message) to detect the classic
scam lifecycle:

  NORMAL → GROOMING → PRIMING → CRITICAL_ASK → PRESSURE

Key ideas:
  - Every message is phase-labelled using fraudRules.detectPhase()
  - A "progression score" rises when phases occur in the expected scam order
  - "Escalation speed" penalises conversations that jump phases suspiciously fast
  - The engine is dynamically adaptive: each new message re-evaluates the arc
  - A grooming-only conversation raises a "watch" warning, not a full alert
  - A critical ask with NO prior grooming is treated as a blunt scam attempt
==============================================================================
*/

import { readCollection } from "../db/localStore.js";
import { detectPhase, PHASES } from "./fraudRules.js";

// ── Phase ordering (lower index = earlier in scam lifecycle) ─────────────────
const PHASE_ORDER = [
  PHASES.NORMAL,
  PHASES.GROOMING,
  PHASES.PRIMING,
  PHASES.CRITICAL_ASK,
  PHASES.PRESSURE,
];

// ── Risk labels ───────────────────────────────────────────────────────────────
function riskLabel(score) {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

// ── Scoring weights per phase (how much each phase contributes to overall risk)
const PHASE_WEIGHT = {
  [PHASES.NORMAL]:       0,
  [PHASES.GROOMING]:    10,
  [PHASES.PRIMING]:     20,
  [PHASES.CRITICAL_ASK]: 45,
  [PHASES.PRESSURE]:    25,
};

/**
 * Computes how fast the conversation escalated.
 * "fast" = went from NORMAL to CRITICAL_ASK in fewer than 6 messages.
 * "gradual" = took 6+ messages.
 * "none" = never reached CRITICAL_ASK.
 */
function computeEscalationSpeed(phaseHistory) {
  const firstNonNormal = phaseHistory.findIndex((p) => p !== PHASES.NORMAL);
  const firstCritical  = phaseHistory.findIndex((p) => p === PHASES.CRITICAL_ASK);

  if (firstCritical === -1) return "none";
  if (firstNonNormal === -1) return "instant"; // straight to ask with no warmup

  const gap = firstCritical - firstNonNormal;
  return gap <= 5 ? "fast" : "gradual";
}

/**
 * Checks if the phase sequence follows the canonical scam order.
 * Returns a bonus multiplier (1.0 – 1.5) for how "clean" the progression is.
 */
function progressionBonus(phaseHistory) {
  // Walk the history and see if we observe the phases in rising order
  let maxSeen = 0;
  let inOrderCount = 0;

  for (const p of phaseHistory) {
    const idx = PHASE_ORDER.indexOf(p);
    if (idx >= maxSeen) {
      maxSeen = idx;
      inOrderCount++;
    }
  }

  const ratio = phaseHistory.length > 0 ? inOrderCount / phaseHistory.length : 0;
  return 1.0 + ratio * 0.5; // 1.0 = no pattern, 1.5 = perfect scam order
}

/**
 * Builds a human-readable explanation of what was detected.
 */
function buildSummary(phases, currentPhase, escalationSpeed, score) {
  const uniquePhases = [...new Set(phases)].filter((p) => p !== PHASES.NORMAL);
  const parts = [];

  if (uniquePhases.includes(PHASES.GROOMING)) {
    parts.push("Unusual trust-building behaviour detected");
  }
  if (uniquePhases.includes(PHASES.PRIMING)) {
    parts.push("False authority or emotional manipulation detected");
  }
  if (uniquePhases.includes(PHASES.CRITICAL_ASK)) {
    parts.push("Direct request for money, OTP, or credentials found");
  }
  if (uniquePhases.includes(PHASES.PRESSURE)) {
    parts.push("Pressure/threat tactics used");
  }
  if (escalationSpeed === "fast" || escalationSpeed === "instant") {
    parts.push("Conversation escalated suspiciously quickly");
  }

  if (parts.length === 0) return "No suspicious patterns detected in this conversation.";
  return parts.join(". ") + ".";
}

/**
 * Generates an alert message based on risk level and current phase.
 */
function buildAlert(riskLvl, currentPhase) {
  if (riskLvl === "critical") {
    return currentPhase === PHASES.CRITICAL_ASK
      ? "🚨 SCAM IN PROGRESS — Do NOT share any information, click any links, or send money."
      : "🚨 HIGH FRAUD RISK — This contact is using known scam pressure tactics.";
  }
  if (riskLvl === "high") {
    return "⚠️ HIGH RISK — This conversation follows a known scam pattern. Proceed with caution.";
  }
  if (riskLvl === "medium") {
    return "👁️ SUSPICIOUS — Unusual patterns detected. Stay alert.";
  }
  return null;
}

/**
 * Generates a recommendation based on current phase.
 */
function buildRecommendation(currentPhase, riskLvl) {
  if (currentPhase === PHASES.CRITICAL_ASK) {
    return "Do not send money, share OTPs, or click unknown links. Block and report this contact.";
  }
  if (currentPhase === PHASES.PRESSURE) {
    return "Do not give in to threats or urgency. Scammers use pressure to bypass rational thinking.";
  }
  if (currentPhase === PHASES.PRIMING) {
    return "Be cautious. This contact may be setting up context for a future scam attempt.";
  }
  if (currentPhase === PHASES.GROOMING && riskLvl !== "low") {
    return "Watch this contact. Unusual friendliness from an unknown person can be the first stage of a scam.";
  }
  return "No immediate action needed. Continue monitoring.";
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Analyses the full fraud progression of a conversation.
 *
 * @param {string} chatId - The chat ID to analyse
 * @param {{ text: string, from: string, timestamp: number }[]} [messages]
 *   Optional pre-loaded messages. If omitted, loaded from localStore.
 * @returns {Promise<object>} Full progression analysis result
 */
export async function analyzeProgression(chatId, messages = null) {
  // ── 1. Load messages ───────────────────────────────────────────────────────
  if (!messages) {
    const allMessages = await readCollection("messages");
    messages = allMessages
      .filter((m) => m.chatId === chatId)
      .sort((a, b) => {
        // Sort chronologically
        const at = a.createdAt?.__waaaDate ? new Date(a.createdAt.iso).getTime() : (a.createdAt ?? 0);
        const bt = b.createdAt?.__waaaDate ? new Date(b.createdAt.iso).getTime() : (b.createdAt ?? 0);
        return at - bt;
      });
  }

  if (messages.length === 0) {
    return {
      chatId,
      currentPhase: PHASES.NORMAL,
      phaseHistory: [],
      progressionScore: 0,
      riskLevel: "low",
      escalationSpeed: "none",
      signals: [],
      summary: "No messages found for this chat.",
      alert: null,
      recommendation: "No action needed.",
      messageCount: 0,
    };
  }

  // ── 2. Classify each message into a phase ─────────────────────────────────
  const labelledMessages = messages.map((msg) => {
    const text = msg.text || msg.body || msg.message || "";
    const { phase, signals } = detectPhase(text);
    return { ...msg, detectedPhase: phase, phaseSignals: signals };
  });

  const phaseHistory = labelledMessages.map((m) => m.detectedPhase);
  const currentPhase = phaseHistory[phaseHistory.length - 1] ?? PHASES.NORMAL;

  // ── 3. Compute raw score ──────────────────────────────────────────────────
  // Sum up weights for each non-normal phase message
  let rawScore = phaseHistory.reduce((acc, p) => acc + (PHASE_WEIGHT[p] ?? 0), 0);

  // Normalise to 0–100 relative to message count
  // Max possible raw = all messages at CRITICAL_ASK weight (45)
  const maxRaw = messages.length * PHASE_WEIGHT[PHASES.CRITICAL_ASK];
  let score = maxRaw > 0 ? (rawScore / maxRaw) * 100 : 0;

  // ── 4. Apply progression bonus (ordered phases = more suspicious) ─────────
  const bonus = progressionBonus(phaseHistory);
  score = Math.min(score * bonus, 100);

  // ── 5. Escalation speed penalty ───────────────────────────────────────────
  const escalationSpeed = computeEscalationSpeed(phaseHistory);
  if (escalationSpeed === "instant") score = Math.min(score + 30, 100);
  else if (escalationSpeed === "fast") score = Math.min(score + 15, 100);

  // ── 6. Hard floor: if CRITICAL_ASK was detected, minimum score is 50 ──────
  const hasCriticalAsk = phaseHistory.includes(PHASES.CRITICAL_ASK);
  if (hasCriticalAsk) score = Math.max(score, 50);

  // ── 7. Collect all unique signals across conversation ─────────────────────
  const allSignals = [
    ...new Set(labelledMessages.flatMap((m) => m.phaseSignals)),
  ];

  // ── 8. Build output ───────────────────────────────────────────────────────
  const finalScore = Math.round(score);
  const riskLvl    = riskLabel(finalScore);
  const summary    = buildSummary(phaseHistory, currentPhase, escalationSpeed, finalScore);
  const alert      = buildAlert(riskLvl, currentPhase);
  const recommendation = buildRecommendation(currentPhase, riskLvl);

  // Per-phase counts for dashboard charts
  const phaseCounts = Object.fromEntries(
    Object.values(PHASES).map((p) => [p, phaseHistory.filter((x) => x === p).length])
  );

  // Annotated timeline (last 20 messages max, to keep payload manageable)
  const timeline = labelledMessages.slice(-20).map((m) => ({
    text: (m.text || m.body || m.message || "").slice(0, 120),
    phase: m.detectedPhase,
    signals: m.phaseSignals,
    timestamp: m.createdAt?.iso ?? m.createdAt ?? null,
  }));

  return {
    chatId,
    currentPhase,
    phaseHistory,
    phaseCounts,
    progressionScore: finalScore,
    riskLevel: riskLvl,
    escalationSpeed,
    signals: allSignals,
    summary,
    alert,
    recommendation,
    timeline,
    messageCount: messages.length,
    analysedAt: new Date().toISOString(),
  };
}
