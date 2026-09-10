/*
==============================================================================
WAAA - Range & Timezone Resolver                                       Phase 7
==============================================================================

Parses relative, absolute, and natural language date/time ranges into concrete
ISO [startAt, endAt] boundaries using the configured timezone.

Supported Ranges:
- "today" / "TODAY"
- "yesterday" / "YESTERDAY"
- "last_2_days" / "last 2 days" / "2 days"
- "last_3_days" / "last 3 days" / "3 days"
- "last_7_days" / "last 7 days" / "7 days" / "this week" / "last week"
- "last_30_days" / "last 30 days" / "30 days" / "this month" / "last month"
- "entire_chat" / "all" / "all_time"
- Custom ISO / Date strings: "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ssZ"
- Natural language queries: "from Sept 5 to Sept 8", "Sept 5 - Sept 8",
  "from Monday to Wednesday", "Summarize SIH discussion from Sept 5 to Sept 8"
==============================================================================
*/

// Configured timezone (default: Asia/Kolkata / IST, or process.env.TIMEZONE / TZ)
export function getConfiguredTimezone() {
  return process.env.TIMEZONE || process.env.TZ || "Asia/Kolkata";
}

/**
 * Gets the current date components in the configured timezone.
 * @param {Date|number|string} [refDate] - Reference date (defaults to now)
 * @param {string} [tz] - Timezone identifier
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number, dayOfWeek: number, offsetMs: number }}
 */
export function getTimezoneParts(refDate = new Date(), tz = getConfiguredTimezone()) {
  const d = new Date(refDate);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOfWeek = weekdays.indexOf(map.weekday);

  // Approximate timezone offset
  const utcDate = new Date(d.toISOString());
  const localDateFromParts = new Date(
    Date.UTC(
      parseInt(map.year, 10),
      parseInt(map.month, 10) - 1,
      parseInt(map.day, 10),
      parseInt(map.hour === "24" ? "0" : map.hour, 10),
      parseInt(map.minute, 10),
      parseInt(map.second, 10)
    )
  );
  const offsetMs = localDateFromParts.getTime() - utcDate.getTime();

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour === "24" ? "0" : map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    dayOfWeek,
    offsetMs,
  };
}

/**
 * Creates an ISO timestamp for a specific YYYY-MM-DD HH:mm:ss in the configured timezone.
 */
function createZonedISO(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0, tz = getConfiguredTimezone()) {
  const baseUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  const parts = getTimezoneParts(baseUTC, tz);
  const diffMs = parts.offsetMs;
  const targetUTC = new Date(baseUTC.getTime() - diffMs);
  return targetUTC.toISOString();
}

/**
 * Returns the start of day (00:00:00.000) for a given date in the configured timezone.
 */
export function getStartOfDay(refDate = new Date(), tz = getConfiguredTimezone()) {
  const p = getTimezoneParts(refDate, tz);
  return createZonedISO(p.year, p.month, p.day, 0, 0, 0, 0, tz);
}

/**
 * Returns the end of day (23:59:59.999) for a given date in the configured timezone.
 */
export function getEndOfDay(refDate = new Date(), tz = getConfiguredTimezone()) {
  const p = getTimezoneParts(refDate, tz);
  return createZonedISO(p.year, p.month, p.day, 23, 59, 59, 999, tz);
}

/**
 * Resolves a range definition into strict [startAt, endAt] ISO strings.
 *
 * @param {object|string} input - Range descriptor, preset name, or query string
 * @param {object} [options]
 * @param {Date} [options.referenceDate] - Baseline date for relative calculations (default: new Date())
 * @param {string} [options.timezone] - Override timezone
 * @returns {{ startAt: string|null, endAt: string|null, label: string, topic?: string, intent?: string }}
 */
export function resolveRange(input, options = {}) {
  const refDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const tz = options.timezone || getConfiguredTimezone();

  // If input is an object with explicit startAt / endAt
  if (typeof input === "object" && input !== null) {
    if (input.startAt || input.endAt) {
      return {
        startAt: input.startAt ? new Date(input.startAt).toISOString() : null,
        endAt: input.endAt ? new Date(input.endAt).toISOString() : new Date(refDate).toISOString(),
        label: input.label || "custom",
        topic: input.topic || null,
        intent: input.intent || "SUMMARY",
      };
    }
    if (input.range) {
      return resolveRange(input.range, { ...options, topic: input.topic, intent: input.intent });
    }
  }

  const rawStr = String(input || "all").trim();
  const lower = rawStr.toLowerCase();

  // ── Extract Intent & Topic from natural queries ────────────────────────────
  let detectedTopic = options.topic || null;
  let detectedIntent = options.intent || "SUMMARY";

  if (/\b(urgent|critical|emergency|high priority)\b/i.test(lower)) {
    detectedIntent = "URGENT";
  } else if (/\b(who is waiting for me|who is waiting on me|waiting on me|waiting for me)\b/i.test(lower)) {
    detectedIntent = "WAITING_ON_ME";
  } else if (/\b(what am i waiting for|who am i waiting for|waiting for)\b/i.test(lower)) {
    detectedIntent = "WAITING_FOR";
  } else if (/\b(pending|follow up)\b/i.test(lower)) {
    detectedIntent = "PENDING";
  } else if (/\b(decision|decisions|agreed|concluded)\b/i.test(lower)) {
    detectedIntent = "DECISIONS";
  } else if (/\b(deadlines?|due date|due dates?)\b/i.test(lower)) {
    detectedIntent = "DEADLINES";
  } else if (/\b(blockers?|stuck|impediments?)\b/i.test(lower)) {
    detectedIntent = "BLOCKERS";
  } else if (/\b(what do i need to do|my tasks?|my actions?|assigned to me|to do|todo)\b/i.test(lower)) {
    detectedIntent = "USER_ACTIONS";
  } else if (/\b(tasks?|action items?|actions?)\b/i.test(lower)) {
    detectedIntent = "TASKS";
  } else if (/\b(changed|changes|updates|what changed)\b/i.test(lower)) {
    detectedIntent = "CHANGES";
  }

  // Topic / Project pattern (e.g., "SIH discussion", "about SIH", "for SIH", "pending for SIH")
  const topicMatch = rawStr.match(/\b(?:about|with|for|discuss(?:ion)?(?: on)?|project|initiative|hackathon)\s+([A-Za-z0-9_-]+)/i);
  if (topicMatch && !detectedTopic) {
    const candidate = topicMatch[1];
    if (!/^(the|a|this|that|an|me|you|us|it|tomorrow|today|yesterday|week|month)$/i.test(candidate)) {
      detectedTopic = candidate;
    }
  }

  // ── 1. Preset: Today ────────────────────────────────────────────────────────
  if (lower === "today" || /\btoday\b/.test(lower)) {
    return {
      startAt: getStartOfDay(refDate, tz),
      endAt: getEndOfDay(refDate, tz),
      label: "today",
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  // ── 2. Preset: Tomorrow ─────────────────────────────────────────────────────
  if (lower === "tomorrow" || /\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(refDate.getTime() + 24 * 60 * 60 * 1000);
    return {
      startAt: getStartOfDay(tomorrow, tz),
      endAt: getEndOfDay(tomorrow, tz),
      label: "tomorrow",
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  // ── 3. Preset: Yesterday ────────────────────────────────────────────────────
  if (lower === "yesterday" || /\byesterday\b/.test(lower)) {
    const yesterday = new Date(refDate.getTime() - 24 * 60 * 60 * 1000);
    return {
      startAt: getStartOfDay(yesterday, tz),
      endAt: getEndOfDay(yesterday, tz),
      label: "yesterday",
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  // ── 3. Preset: Last 2 Days / 3 Days / 7 Days / 30 Days ──────────────────────
  const daysMatch = lower.match(/(?:last|past)\s*(\d+)\s*days?/i) || lower.match(/^(\d+)[_\s]*days?$/i);
  if (daysMatch) {
    const numDays = parseInt(daysMatch[1], 10);
    const startDate = new Date(refDate.getTime() - (numDays - 1) * 24 * 60 * 60 * 1000);
    return {
      startAt: getStartOfDay(startDate, tz),
      endAt: getEndOfDay(refDate, tz),
      label: `last_${numDays}_days`,
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  // ── 4. Preset: This Week / Last Week ─────────────────────────────────────────
  if (lower === "this week" || lower === "this_week" || /\bthis week\b/.test(lower)) {
    const parts = getTimezoneParts(refDate, tz);
    // Monday is index 1, Sunday is 0 -> calculate distance from Monday
    const distToMonday = (parts.dayOfWeek + 6) % 7;
    const monday = new Date(refDate.getTime() - distToMonday * 24 * 60 * 60 * 1000);
    return {
      startAt: getStartOfDay(monday, tz),
      endAt: getEndOfDay(refDate, tz),
      label: "this_week",
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  if (lower === "last week" || lower === "last_week" || /\blast week\b/.test(lower)) {
    const parts = getTimezoneParts(refDate, tz);
    const distToMonday = (parts.dayOfWeek + 6) % 7;
    const lastMonday = new Date(refDate.getTime() - (distToMonday + 7) * 24 * 60 * 60 * 1000);
    const lastSunday = new Date(refDate.getTime() - (distToMonday + 1) * 24 * 60 * 60 * 1000);
    return {
      startAt: getStartOfDay(lastMonday, tz),
      endAt: getEndOfDay(lastSunday, tz),
      label: "last_week",
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  // ── 5. Preset: This Month / Last Month ──────────────────────────────────────
  if (lower === "this month" || lower === "this_month" || /\bthis month\b/.test(lower)) {
    const parts = getTimezoneParts(refDate, tz);
    const startOfMonth = createZonedISO(parts.year, parts.month, 1, 0, 0, 0, 0, tz);
    return {
      startAt: startOfMonth,
      endAt: getEndOfDay(refDate, tz),
      label: "this_month",
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  if (lower === "last month" || lower === "last_month" || /\blast month\b/.test(lower)) {
    const parts = getTimezoneParts(refDate, tz);
    const lastMonth = parts.month === 1 ? 12 : parts.month - 1;
    const lastMonthYear = parts.month === 1 ? parts.year - 1 : parts.year;
    const daysInLastMonth = new Date(lastMonthYear, lastMonth, 0).getDate();
    return {
      startAt: createZonedISO(lastMonthYear, lastMonth, 1, 0, 0, 0, 0, tz),
      endAt: createZonedISO(lastMonthYear, lastMonth, daysInLastMonth, 23, 59, 59, 999, tz),
      label: "last_month",
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  // ── 6. Natural Day Range: "from Monday to Wednesday", etc. ──────────────────
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayNameMatch = lower.match(/(?:from\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:to|-)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (dayNameMatch) {
    const fromDayIdx = dayNames.indexOf(dayNameMatch[1].toLowerCase());
    const toDayIdx = dayNames.indexOf(dayNameMatch[2].toLowerCase());
    const parts = getTimezoneParts(refDate, tz);
    const currentDayIdx = parts.dayOfWeek;

    let diffFrom = (currentDayIdx - fromDayIdx + 7) % 7;
    let diffTo = (currentDayIdx - toDayIdx + 7) % 7;

    const fromDate = new Date(refDate.getTime() - diffFrom * 24 * 60 * 60 * 1000);
    const toDate = new Date(refDate.getTime() - diffTo * 24 * 60 * 60 * 1000);

    return {
      startAt: getStartOfDay(fromDate, tz),
      endAt: getEndOfDay(toDate, tz),
      label: `${dayNameMatch[1]}_to_${dayNameMatch[2]}`,
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  // ── 6b. Single Day: "by Friday", "on Monday", "Friday" ──────────────────────
  const singleDayMatch = lower.match(/(?:by|on|due\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (singleDayMatch && !lower.includes("to") && !lower.includes("-")) {
    const dayName = singleDayMatch[1].toLowerCase();
    const targetDayIdx = dayNames.indexOf(dayName);
    const parts = getTimezoneParts(refDate, tz);
    const currentDayIdx = parts.dayOfWeek;
    let daysAhead = (targetDayIdx - currentDayIdx + 7) % 7;
    if (daysAhead === 0) daysAhead = 7;
    const targetDate = new Date(refDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    return {
      startAt: getStartOfDay(targetDate, tz),
      endAt: getEndOfDay(targetDate, tz),
      label: dayName,
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  // ── 7. Month & Day Ranges: "Sept 5 to Sept 8", "September 5 - 8", etc. ───────
  const monthMap = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
    september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };

  const monthRangeMatch = lower.match(
    /(?:from\s+)?([a-z]+)\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|-)\s*(?:([a-z]+)\s*)?(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/i
  );

  if (monthRangeMatch) {
    const m1Name = monthRangeMatch[1].toLowerCase();
    const d1 = parseInt(monthRangeMatch[2], 10);
    const m2Name = monthRangeMatch[3] ? monthRangeMatch[3].toLowerCase() : m1Name;
    const d2 = parseInt(monthRangeMatch[4], 10);
    const curParts = getTimezoneParts(refDate, tz);
    const y = monthRangeMatch[5] ? parseInt(monthRangeMatch[5], 10) : curParts.year;

    const m1 = monthMap[m1Name];
    const m2 = monthMap[m2Name];

    if (m1 && m2 && d1 > 0 && d1 <= 31 && d2 > 0 && d2 <= 31) {
      return {
        startAt: createZonedISO(y, m1, d1, 0, 0, 0, 0, tz),
        endAt: createZonedISO(y, m2, d2, 23, 59, 59, 999, tz),
        label: `${m1Name}_${d1}_to_${m2Name}_${d2}`,
        topic: detectedTopic,
        intent: detectedIntent,
      };
    }
  }

  // ── 8. Explicit Date Range: "YYYY-MM-DD to YYYY-MM-DD" ───────────────────────
  const isoRangeMatch = rawStr.match(/(\d{4}-\d{2}-\d{2})(?:T[\d:.]+Z?)?\s*(?:to|-)\s*(\d{4}-\d{2}-\d{2})(?:T[\d:.]+Z?)?/i);
  if (isoRangeMatch) {
    return {
      startAt: getStartOfDay(new Date(isoRangeMatch[1]), tz),
      endAt: getEndOfDay(new Date(isoRangeMatch[2]), tz),
      label: `${isoRangeMatch[1]}_to_${isoRangeMatch[2]}`,
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  // ── 9. Single Date: "YYYY-MM-DD" ────────────────────────────────────────────
  const singleDateMatch = rawStr.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (singleDateMatch) {
    return {
      startAt: getStartOfDay(new Date(singleDateMatch[1]), tz),
      endAt: getEndOfDay(new Date(singleDateMatch[1]), tz),
      label: singleDateMatch[1],
      topic: detectedTopic,
      intent: detectedIntent,
    };
  }

  // ── 10. Default: All / Entire Chat ──────────────────────────────────────────
  return {
    startAt: null,
    endAt: null,
    label: "entire_chat",
    topic: detectedTopic,
    intent: detectedIntent,
  };
}
