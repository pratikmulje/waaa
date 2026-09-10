/*
Trusted domains are excluded from the generic link rule so ordinary
sharing (Meet/Zoom/Calendar/Drive links, etc.) doesn't get flagged.
A link is only "suspicious" if it's a shortener, a raw IP, or an
unrecognized domain — and it scores higher when paired with other
scam signals (urgency, impersonation, credential/payment requests),
since that combination is what actually distinguishes phishing from
a normal shared link.
*/
const TRUSTED_LINK_DOMAINS = [
  "meet.google.com",
  "zoom.us",
  "calendar.google.com",
  "drive.google.com",
  "docs.google.com",
  "forms.google.com",
  "youtube.com",
  "youtu.be",
  "github.com",
  "whatsapp.com",
  "wa.me",
  "linkedin.com",
  "maps.google.com",
  "goo.gl/maps",
];

const SHORTENER_DOMAINS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
];

const rules = [
  {
    name: "OTP request",
    patterns: [
      /\botp\b/i,
      /\bone[- ]time password\b/i,
      /\bverification code\b/i,
      /\bverification otp\b/i,
    ],
    score: 25,
  },

  {
    name: "Urgency",
    patterns: [
      /\burgent\b/i,
      /\bimmediately\b/i,
      /\bact now\b/i,
      /\bwithin \d+ (minutes?|hours?)\b/i,
      /\bright now\b/i,
      /\bfinal (reminder|notice|warning)\b/i,
      /\blast chance\b/i,
      /\bexpires? (today|soon|in \d+)/i,
    ],
    score: 20,
  },

  {
    name: "Account or service threat",
    patterns: [
      /\b(account|package|parcel|delivery|shipment|order|subscription|service)\b[\s\S]{0,25}\b(suspend|block|deactivat|clos|hold|cancel|restrict)/i,
      /\breturn to sender\b/i,
      /\bincomplete address\b/i,
      /\bfailed delivery\b/i,
      /\bupdate.*(details|address|information).*avoid\b/i,
    ],
    score: 25,
  },

  {
    name: "Payment request",
    patterns: [
      /\bsend money\b/i,
      /\bmake a payment\b/i,
      /\bpay immediately\b/i,
      /\btransfer.*money\b/i,
      /\bupi\b/i,
      /\bbank account\b/i,
      /\bpay(ment)? (a )?(fee|charge)\b/i,
    ],
    score: 20,
  },

  {
    name: "Credential request",
    patterns: [
      /\bpassword\b/i,
      /\bpin\b/i,
      /\bcvv\b/i,
      /\blogin details\b/i,
      /\bcredit card\b/i,
      /\bdebit card\b/i,
    ],
    score: 30,
  },

  {
    name: "Suspicious link",
    // Evaluated specially in analyzeRules() below (domain-aware), not
    // via simple pattern.test() like the other rules.
    patterns: [],
    score: 20,
  },

  {
    name: "Prize or reward",
    patterns: [
      /\byou won\b/i,
      /\bcongratulations.*winner\b/i,
      /\bclaim.*prize\b/i,
      /\blottery\b/i,
      /\bcash prize\b/i,
    ],
    score: 20,
  },
];

function findLinkVerdict(text) {
  const urls = text.match(/https?:\/\/[^\s]+|www\.[^\s]+/gi);
  if (!urls || urls.length === 0) return null;

  for (const raw of urls) {
    let host;
    try {
      host = new URL(raw.startsWith("http") ? raw : `http://${raw}`).hostname.toLowerCase();
    } catch {
      continue;
    }

    const isTrusted = TRUSTED_LINK_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
    if (isTrusted) continue;

    const isShortener = SHORTENER_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
    const isRawIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    const looksImpersonating = /(secure|verify|update|account|login|confirm)[-.]?/.test(host);

    return { host, isShortener, isRawIp, looksImpersonating, suspicious: true };
  }

  return { suspicious: false }; // links present but all trusted
}

export function analyzeRules(text) {
  let score = 0;
  const reasons = [];

  for (const rule of rules) {
    if (rule.name === "Suspicious link") continue; // handled below
    const matched = rule.patterns.some((pattern) => pattern.test(text));
    if (matched) {
      score += rule.score;
      reasons.push(rule.name);
    }
  }

  const link = findLinkVerdict(text);
  if (link?.suspicious) {
    let linkScore = 20;
    if (link.isShortener) linkScore += 10;
    if (link.isRawIp) linkScore += 15;
    if (link.looksImpersonating) linkScore += 10;
    score += linkScore;
    reasons.push("Suspicious link");
  }

  // Classic phishing combo: impersonation/urgency + a link together is a
  // much stronger signal than either alone — reward it instead of just
  // summing two mid-size rule scores.
  const hasThreatOrUrgency = reasons.some((r) => r === "Urgency" || r === "Account or service threat");
  if (hasThreatOrUrgency && link?.suspicious) {
    score += 15;
    reasons.push("Urgency + link combination");
  }

  return {
    score: Math.min(score, 100),
    reasons,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE DETECTION — used by fraudProgressionEngine.js
//
// Each message is classified into one of 5 scam lifecycle phases.
// These are not mutually exclusive — a message can show multiple phase signals,
// but we return the highest-priority one found.
// ─────────────────────────────────────────────────────────────────────────────

export const PHASES = {
  NORMAL:       "NORMAL",        // nothing suspicious
  GROOMING:     "GROOMING",      // trust-building, over-friendly, probing
  PRIMING:      "PRIMING",       // authority/context setup, emotional manipulation
  CRITICAL_ASK: "CRITICAL_ASK", // direct ask: money, OTP, link, credentials
  PRESSURE:     "PRESSURE",      // follow-up guilt/threats after being ignored
};

const PHASE_SIGNALS = [
  {
    phase: PHASES.CRITICAL_ASK,
    // Highest priority — if any of these fire, it's the critical move
    patterns: [
      /\botp\b/i,
      /\bone[- ]time password\b/i,
      /\bverification code\b/i,
      /\bsend money\b/i,
      /\btransfer.*(?:money|funds|amount)\b/i,
      /\bmake.*payment\b/i,
      /\bpay.*(?:fee|charge|immediately|now)\b/i,
      /\bupi\b/i,
      /\bbank account\b/i,
      /\bcredit card\b/i,
      /\bdebit card\b/i,
      /\bcvv\b/i,
      /\bpassword\b/i,
      /\bpin\b/i,
      /\blogin details\b/i,
      /\bclick (?:this|the) link\b/i,
      /\bopen (?:this|the) link\b/i,
      /\bdownload (?:this|the) app\b/i,
      /\binstall this\b/i,
      /\bgive me your\b/i,
      /\bshare your\b/i,
      /\bforward this\b/i,
      /\bwire\b/i,
      /\bcash.*(?:send|give|transfer)\b/i,
      /\bgift card\b/i,
      /\brecharge.*for me\b/i,
    ],
    signals: ["Direct financial/credential request"],
  },
  {
    phase: PHASES.PRESSURE,
    // Follow-up escalation after being ignored
    patterns: [
      /\bwhy aren'?t you (?:replying|responding)\b/i,
      /\byou'?re ignoring\b/i,
      /\blast (?:chance|warning|reminder)\b/i,
      /\bfinal (?:notice|warning|reminder)\b/i,
      /\bif you don'?t\b/i,
      /\bor else\b/i,
      /\bconsequences\b/i,
      /\bpolice\b.*\bif\b/i,
      /\blegal action\b/i,
      /\btime is running out\b/i,
      /\bexpires? (?:today|soon|in \d+)\b/i,
      /\bact now\b/i,
      /\bwithin \d+ (?:minutes?|hours?)\b/i,
      /\bright now\b/i,
      /\bimmediately\b/i,
      /\burgent\b/i,
      /\bdo it now\b/i,
    ],
    signals: ["Escalation / pressure tactics"],
  },
  {
    phase: PHASES.PRIMING,
    // Building false context: fake authority, emotional setup
    patterns: [
      /\bi'?m (?:calling|contacting|reaching out) from\b/i,
      /\bi work (?:at|for|with)\b/i,
      /\bour (?:records|system|database) show\b/i,
      /\byour (?:account|package|order|KYC|subscription)\b.*\b(?:issue|problem|hold|suspended|blocked|expired)\b/i,
      /\bKYC\b/i,
      /\bverif(?:y|ication) required\b/i,
      /\bfailed delivery\b/i,
      /\bincomplete address\b/i,
      /\bunclaimed\b/i,
      /\bI feel so bad\b/i,
      /\bmy (?:child|mother|father|family|sister|brother) is\b/i,
      /\bin (?:hospital|trouble|danger|emergency)\b/i,
      /\bstranded\b/i,
      /\bstuck\b.*\bno money\b/i,
      /\bcongratulations.*(?:won|selected|chosen)\b/i,
      /\byou have been selected\b/i,
      /\blottery\b/i,
      /\bcash prize\b/i,
      /\bjob offer\b/i,
      /\bwork from home\b.*\b(?:earn|income|salary)\b/i,
    ],
    signals: ["False authority or emotional manipulation"],
  },
  {
    phase: PHASES.GROOMING,
    // Trust building: unusually warm, probing, mirroring
    patterns: [
      /\bhow are you (?:doing|today|my friend)\b/i,
      /\blong time no (?:see|talk|chat)\b/i,
      /\bi (?:miss|missed) you\b/i,
      /\byou seem (?:so|very|really) (?:nice|kind|smart|intelligent|beautiful|handsome)\b/i,
      /\bwe have so much in common\b/i,
      /\bi feel like i(?:'ve)? known you\b/i,
      /\btrust me\b/i,
      /\bi'?m your (?:friend|brother|sister|well-wisher)\b/i,
      /\bjust between us\b/i,
      /\bdon'?t tell anyone\b/i,
      /\bkeep this (?:secret|between us|private)\b/i,
      /\bspecial (?:offer|deal|opportunity) (?:for|just for) you\b/i,
      /\byou(?:'re| are) special\b/i,
      /\bI'?ve been watching your (?:profile|posts|work)\b/i,
      /\bwhere are you from\b/i,
      /\bare you (?:married|single|alone)\b/i,
      /\bdo you live alone\b/i,
      /\bwhat do you do for (?:work|a living|fun)\b/i,
    ],
    signals: ["Unusual friendliness / trust grooming"],
  },
];

/**
 * Classifies a single message text into a fraud phase.
 * Returns the highest-priority phase matched, or NORMAL.
 *
 * @param {string} text - The message text to classify
 * @returns {{ phase: string, signals: string[] }}
 */
export function detectPhase(text) {
  for (const def of PHASE_SIGNALS) {
    const matched = def.patterns.some((p) => p.test(text));
    if (matched) {
      return { phase: def.phase, signals: def.signals };
    }
  }
  return { phase: PHASES.NORMAL, signals: [] };
}

