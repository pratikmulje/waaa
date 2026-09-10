import { Router } from "express";
import {
  buildPeopleIndex,
  listPeopleSafe,
  searchPeopleByName,
  findPersonByJid,
  manualMergePeople,
  addIdentityCandidate,
  loadPeople,
} from "../../intelligence/personIdentity.js";

const router = Router();

// ── GET /api/intelligence/people ─────────────────────────────────────────────
// Returns all people (privacy-safe, no JIDs/phone numbers).
// Query: ?search=name
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    const people = search
      ? await searchPeopleByName(search)
      : await listPeopleSafe();

    res.json({ total: people.length, people });
  } catch (err) {
    console.error("[API] /intelligence/people error:", err);
    res.status(500).json({ error: "Failed to list people." });
  }
});

// ── GET /api/intelligence/people/:personId ────────────────────────────────────
router.get("/:personId", async (req, res) => {
  try {
    const people = await loadPeople();
    const person = people.find((p) => p.personId === req.params.personId);
    if (!person) return res.status(404).json({ error: "Person not found." });

    // Return safe version (no JIDs exposed)
    res.json({
      personId:            person.personId,
      primaryName:         person.primaryName,
      knownAs:             person.names,
      hasPersonalChat:     Boolean(person.personalChatId),
      groupChats:          person.groupChats,
      confidence:          person.confidence,
      resolutionMethod:    person.resolutionMethod,
      candidateCount:      person.identityCandidates?.length || 0,
      unconfirmedCandidates: (person.identityCandidates || [])
        .filter((c) => c.status === "UNCONFIRMED")
        .map((c) => ({ personId: c.personId, confidence: c.confidence, reason: c.reason })),
    });
  } catch (err) {
    console.error("[API] /intelligence/people/:personId error:", err);
    res.status(500).json({ error: "Failed to get person." });
  }
});

// ── POST /api/intelligence/people/index ──────────────────────────────────────
// Triggers a full rebuild of the people index from existing messages.
// Safe to call multiple times (idempotent - updates don't duplicate).
router.post("/index", async (req, res) => {
  try {
    console.log("[Identity] Starting people index build...");
    const result = await buildPeopleIndex();
    console.log("[Identity] Index build complete:", result);
    res.json({ message: "People index built successfully.", ...result });
  } catch (err) {
    console.error("[API] /intelligence/people/index error:", err);
    res.status(500).json({ error: "Failed to build people index." });
  }
});

// ── POST /api/intelligence/people/merge ──────────────────────────────────────
// Manually merges two person records. Only for user-confirmed identity merges.
// Body: { targetPersonId, mergeePersonId, reason }
router.post("/merge", async (req, res) => {
  const { targetPersonId, mergeePersonId, reason } = req.body;
  if (!targetPersonId || !mergeePersonId) {
    return res.status(400).json({ error: "targetPersonId and mergeePersonId are required." });
  }

  try {
    const result = await manualMergePeople(targetPersonId, mergeePersonId, reason || "manually confirmed via API");
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error("[API] /intelligence/people/merge error:", err);
    res.status(500).json({ error: "Failed to merge people." });
  }
});

// ── POST /api/intelligence/people/:personId/candidates ───────────────────────
// Adds an unconfirmed identity candidate (for human review, NOT auto-merge).
// Body: { candidatePersonId, reason, confidence }
router.post("/:personId/candidates", async (req, res) => {
  const { candidatePersonId, reason, confidence } = req.body;
  if (!candidatePersonId) {
    return res.status(400).json({ error: "candidatePersonId is required." });
  }

  try {
    const result = await addIdentityCandidate(
      req.params.personId,
      candidatePersonId,
      reason || "manual candidate",
      confidence ?? 0.5
    );
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error("[API] POST /intelligence/people/:personId/candidates error:", err);
    res.status(500).json({ error: "Failed to add candidate." });
  }
});

export default router;
