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
      /\b(commence|commences|commencing|starts? on|scheduled on)\b/i,
      /\bon \d{1,2}(st|nd|rd|th)? [a-z]+( \d{4})?/i,
      /\bat \d{1,2}(:\d{2})? ?(am|pm)\b/i,
      /\blast (date|day|time) to\b/i,
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
      /https?:\/\/(meet\.google\.com|zoom\.us|teams\.microsoft\.com|webex\.com)\/\S+/i,
      /\bjoin (the|for|our|my)?\s*(lab|class|lecture|session|meeting|call|webinar|meet|deam|oop)\b/i,
      /\bjoin for\b/i,
      /\bjoin the\b/i,
      /\b(batch\s*[a-z0-9]+)\b/i,
      /\b(lab|lecture|class) (link|session)\b/i,
    ],
    score: 50,
  },

  {
    name: "task",
    patterns: [
      /\bplease send\b/i,
      /\bplease submit\b/i,
      /\bplease complete\b/i,
      /\bdon't forget\b/i,
      /\bdo not forget\b/i,
      /\bneed you to\b/i,
      /\bcan you send\b/i,
      /\bcomplete (the|this|your|all)?\b/i,
      /\bfinish this\b/i,
      /\bsubmit (the|this|your|all)?\b/i,
      /\bbharna hai\b/i,
      /\bbhar do\b/i,
      /\bfill (the|this|a|your|out)?\b/i,
      /\b(log in|login) to\b/i,
      /\b(forward this|share with|send to all|compile these)\b/i,
      /\bgive (the|your)? feedback\b/i,
    ],
    score: 20,
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
      /\bcompulsory\b/i,
      /\bmandatory\b/i,
      /\bat the earliest\b/i,
      /\bas soon as possible\b/i,
      /\bwithout (any )?delay\b/i,
      /\bstrictly\b/i,
      /\brequested to\b/i,
      /\bkindly requested\b/i,
    ],
    score: 20,
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

  {
    name: "academic",
    patterns: [
      /\bfeedback\b/i,
      /\b(vierp|erp|portal|moodle|lms|gform|google form)\b/i,
      /\b(class[- ]teachers?|coordinator|hod|dean|director|principal|faculty)\b/i,
      /\b(attendance|hall ticket|admit card|results?|grade sheet|defaulter)\b/i,
      /\b(submission|assignment|journal|write[- ]up|black book|synopsis)\b/i,
      /\b(semester|sem \d|b\.?tech|m\.?tech)\b/i,
    ],
    score: 20,
  },

  {
    // Broadcast/announcement patterns — group messages sent to everyone
    name: "announcement",
    patterns: [
      /\bhello everyone\b/i,
      /\bdear (all|everyone|students|team|members)\b/i,
      /\bplease note\b/i,
      /\bkindly note\b/i,
      /\battention (all|everyone|students|please)\b/i,
      /\bimportant (notice|update|announcement|information|info)\b/i,
      /\bannouncement\b/i,
      /\bnotice\b/i,
      /\bcircular\b/i,
    ],
    score: 15,
  },

  {
    // Event / competition / registration — covers SIH, hackathons, college events
    name: "event",
    patterns: [
      /\bsih\b/i,
      /\bhackathon\b/i,
      /\bcompetition\b/i,
      /\bregister\b/i,
      /\bregistration\b/i,
      /\benroll\b/i,
      /\bform (a |the )?team\b/i,
      /\bforming team\b/i,
      /\bteam (formation|required|needed)\b/i,
      /\bparticipate\b/i,
      /\bevent\b/i,
      /\binternship\b/i,
      /\bplacement\b/i,
      /\binterview\b/i,
      /\bworkshop\b/i,
      /\bwebinar\b/i,
      /\bseminar\b/i,
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