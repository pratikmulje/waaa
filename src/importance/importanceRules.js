const rules = [
  {
    name: "deadline",
    patterns: [
      /\bdeadline\b/i,
      /\bdue today\b/i,
      /\bdue tomorrow\b/i,
      /\bby \d+ ?(am|pm)\b/i,
      /\bbefore \d+ ?(am|pm)\b/i,
      /\bsubmit.*today\b/i,
      /\bsubmit.*tomorrow\b/i,
    ],
    score: 20,
  },

  {
    name: "meeting",
    patterns: [
      /\bmeeting\b/i,
      /\bcall at\b/i,
      /\bmeet at\b/i,
      /\bscheduled\b/i,
      /\bappointment\b/i,
      /\bdiscussion at\b/i,
    ],
    score: 15,
  },

  {
    name: "task",
    patterns: [
      /\bplease send\b/i,
      /\bplease submit\b/i,
      /\bdon't forget\b/i,
      /\bdo not forget\b/i,
      /\bneed you to\b/i,
      /\bcan you send\b/i,
      /\bcomplete this\b/i,
      /\bfinish this\b/i,
      /\bsubmit this\b/i,
    ],
    score: 15,
  },

  {
    name: "urgency",
    patterns: [
      /\burgent\b/i,
      /\basap\b/i,
      /\bimmediately\b/i,
      /\bimportant\b/i,
      /\bright now\b/i,
      /\baction required\b/i,
    ],
    score: 15,
  },

  {
    name: "exam",
    patterns: [
      /\bexam\b/i,
      /\btest\b/i,
      /\bviva\b/i,
      /\bpractical\b/i,
      /\bassessment\b/i,
      /\bmid[- ]?term\b/i,
      /\bend[- ]?sem\b/i,
      /\bsemester exam\b/i,
      /\bquiz\b/i,
    ],
    score: 20,
  },
];

export function analyzeImportanceRules(text) {
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