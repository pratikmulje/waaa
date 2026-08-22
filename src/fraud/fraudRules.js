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
      /\bwithin \d+ minutes?\b/i,
      /\bright now\b/i,
      /\btoday\b/i,
    ],
    score: 20,
  },

  {
    name: "Account threat",
    patterns: [
      /\baccount.*suspend/i,
      /\baccount.*blocked/i,
      /\baccount.*deactivat/i,
      /\baccount.*close/i,
    ],
    score: 20,
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
    patterns: [
      /https?:\/\/\S+/i,
      /www\.\S+/i,
      /\bbit\.ly\b/i,
      /\btinyurl\b/i,
      /\bt\.co\//i,
    ],
    score: 15,
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

export function analyzeRules(text) {
  let score = 0;
  const reasons = [];

  for (const rule of rules) {
    const matched = rule.patterns.some((pattern) =>
      pattern.test(text)
    );

    if (matched) {
      score += rule.score;
      reasons.push(rule.name);
    }
  }

  return {
    score: Math.min(score, 100),
    reasons,
  };
}