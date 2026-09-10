/*
==============================================================================
WAAA - Project Intelligence Layer                                      Phase 8
==============================================================================

Discovers, aggregates, and manages lightweight project records.
Stored in data/projects.json.

Design Principles:
1. Stable Project Identity: Uses canonical names & aliases to prevent duplicate
   projects for minor wording variations (e.g. "SIH", "SIH 2026", "Smart India Hackathon").
2. Derived Intelligence: Aggregates actions, tasks, deadlines, blockers, decisions,
   and involved people directly from existing structured intelligence.
3. Zero-Gemini Structured Queries: Answering "What's pending for SIH?" or
   "What are the blockers for SIH?" queries structured fields with 0 Gemini calls.
==============================================================================
*/

import { readCollection, writeCollection } from "../db/localStore.js";
import { loadActions } from "./actionExtractor.js";
import { loadChatSummaries } from "./chatSummarizer.js";
import { loadChunks } from "./chunkSummarizer.js";
import { askAI } from "../ai/geminiClient.js";
import { getCooldownStatus } from "../ai/geminiCooldown.js";
import { getActionMetrics } from "./actionExtractor.js";

const COLLECTION = "projects";

export async function loadProjects() {
  return readCollection(COLLECTION);
}

export async function saveProjects(projects) {
  return writeCollection(COLLECTION, projects);
}

function normalizeProjectKey(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Known project aliases mapping
const KNOWN_PROJECT_ALIASES = {
  sih: ["sih", "smartindiahackathon", "sih2026", "hackathon"],
  vierp: ["vierp", "vierpportal", "erp"],
  feedback: ["feedback", "studentfeedback", "collegefeedback"],
  waaa: ["waaa", "whatsappassistant", "waaabot"],
};

/**
 * Resolves a project name or alias to its canonical project ID.
 */
export function resolveCanonicalProjectId(inputName) {
  const norm = normalizeProjectKey(inputName);
  for (const [canonical, aliases] of Object.entries(KNOWN_PROJECT_ALIASES)) {
    if (aliases.includes(norm) || norm.includes(canonical)) {
      return `proj_${canonical}`;
    }
  }
  return `proj_${norm}`;
}

/**
 * Discovers and syncs all project intelligence records.
 *
 * @returns {Promise<{ synced: number, projects: Array<object> }>}
 */
export async function syncProjects() {
  const [actions, chatSummaries, chunks, existingProjects] = await Promise.all([
    loadActions(),
    loadChatSummaries(),
    loadChunks(),
    loadProjects(),
  ]);

  const projectMap = new Map();

  // Seed existing projects
  for (const p of existingProjects) {
    projectMap.set(p.projectId, p);
  }

  // 1. Seed canonical known projects
  for (const [canonical, aliases] of Object.entries(KNOWN_PROJECT_ALIASES)) {
    const pId = `proj_${canonical}`;
    if (!projectMap.has(pId)) {
      projectMap.set(pId, {
        projectId: pId,
        name: canonical.toUpperCase(),
        aliases: [canonical.toUpperCase(), ...aliases],
        people: [],
        currentState: "ACTIVE",
        tasks: [],
        actions: [],
        deadlines: [],
        blockers: [],
        decisions: [],
        recentChanges: "Tracked project initialized",
        relevantChats: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // 2. Discover projects from actions
  for (const act of actions) {
    if (act.projectName) {
      const pId = act.projectId || resolveCanonicalProjectId(act.projectName);
      if (!projectMap.has(pId)) {
        projectMap.set(pId, {
          projectId: pId,
          name: act.projectName.toUpperCase(),
          aliases: [act.projectName],
          people: [],
          currentState: "ACTIVE",
          tasks: [],
          actions: [],
          deadlines: [],
          blockers: [],
          decisions: [],
          recentChanges: "Project detected from actions",
          relevantChats: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  // 2. Discover projects from chat summaries & chunks
  for (const s of chatSummaries) {
    const textCorpus = `${s.currentTopic || ""} ${s.summary || ""}`;
    for (const [canonical, aliases] of Object.entries(KNOWN_PROJECT_ALIASES)) {
      if (aliases.some((a) => textCorpus.toLowerCase().includes(a))) {
        const pId = `proj_${canonical}`;
        if (!projectMap.has(pId)) {
          projectMap.set(pId, {
            projectId: pId,
            name: canonical.toUpperCase(),
            aliases: [canonical.toUpperCase()],
            people: [],
            currentState: "ACTIVE",
            tasks: [],
            actions: [],
            deadlines: [],
            blockers: [],
            decisions: [],
            recentChanges: s.recentChanges || "Initial project record",
            relevantChats: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  // 3. Populate projects with associated items, people, and chats
  const now = new Date().toISOString();
  for (const [pId, proj] of projectMap.entries()) {
    const projKey = pId.replace(/^proj_/, "");

    // Relevant actions
    const projActions = actions.filter((a) => {
      if (a.projectId === pId) return true;
      if (a.projectName && normalizeProjectKey(a.projectName).includes(projKey)) return true;
      if (a.text && normalizeProjectKey(a.text).includes(projKey)) return true;
      return false;
    });

    proj.tasks = projActions.filter((a) => a.type === "task");
    proj.actions = projActions.filter((a) => a.type === "action" || a.type === "commitment");
    proj.deadlines = projActions.filter((a) => a.type === "deadline" || a.dueAt);
    proj.blockers = projActions.filter((a) => a.type === "blocker" || a.status === "blocked");
    proj.decisions = projActions.filter((a) => a.type === "decision");

    // Compute state
    if (proj.blockers.some((b) => b.status === "blocked")) {
      proj.currentState = "BLOCKED";
    } else if (proj.tasks.length > 0 && proj.tasks.every((t) => t.status === "completed")) {
      proj.currentState = "COMPLETED";
    } else {
      proj.currentState = "ACTIVE";
    }

    // Associated chats
    const relevantChatSet = new Set(projActions.map((a) => a.chatId).filter(Boolean));
    for (const s of chatSummaries) {
      if (`${s.currentTopic} ${s.summary}`.toLowerCase().includes(projKey)) {
        relevantChatSet.add(s.chatId);
      }
    }
    proj.relevantChats = Array.from(relevantChatSet);

    // Associated people
    const peopleSet = new Set(proj.people || []);
    projActions.forEach((a) => {
      if (a.person) peopleSet.add(a.person);
      if (a.waitingFor) peopleSet.add(a.waitingFor);
      if (a.waitingOnUser) peopleSet.add(a.waitingOnUser);
    });
    for (const s of chatSummaries) {
      if (relevantChatSet.has(s.chatId) && Array.isArray(s.peopleInvolved)) {
        s.peopleInvolved.forEach((p) => peopleSet.add(p));
      }
    }
    proj.people = Array.from(peopleSet);
    proj.updatedAt = now;
  }

  const updatedProjects = Array.from(projectMap.values());
  await saveProjects(updatedProjects);

  return {
    synced: updatedProjects.length,
    projects: updatedProjects,
  };
}

/**
 * Retrieves a single project record by ID or Name.
 */
export async function getProject(projectIdOrName) {
  const projects = await loadProjects();
  const pId = resolveCanonicalProjectId(projectIdOrName);
  const norm = normalizeProjectKey(projectIdOrName);

  return (
    projects.find(
      (p) =>
        p.projectId === pId ||
        p.projectId === projectIdOrName ||
        normalizeProjectKey(p.name) === norm ||
        (Array.isArray(p.aliases) && p.aliases.some((a) => normalizeProjectKey(a) === norm))
    ) || null
  );
}

/**
 * Answers a project-specific intelligence query.
 *
 * @param {string} projectIdOrName
 * @param {string} query
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function queryProjectIntelligence(projectIdOrName, query = "", options = {}) {
  const { force = false } = options;
  let project = await getProject(projectIdOrName);

  if (!project) {
    // Attempt to sync and look again
    await syncProjects();
    project = await getProject(projectIdOrName);
  }

  if (!project) {
    return {
      error: `Project "${projectIdOrName}" not found.`,
      projectId: null,
      found: false,
    };
  }

  const lowerQuery = String(query || "").toLowerCase();
  const metrics = getActionMetrics();

  // ── Deterministic Structured Queries (0 Gemini Calls) ──────────────────────
  if (/pending|tasks?|to do|what's pending|what is pending/i.test(lowerQuery)) {
    metrics.geminiCallsAvoided++;
    const pendingTasks = (project.tasks || []).filter((t) => t.status === "pending" || t.status === "waiting");
    return {
      projectId: project.projectId,
      name: project.name,
      currentState: project.currentState,
      queryType: "PENDING_TASKS",
      count: pendingTasks.length,
      items: pendingTasks,
      summary: pendingTasks.length > 0
        ? `There are ${pendingTasks.length} pending task(s) for project ${project.name}.`
        : `No pending tasks for project ${project.name}.`,
      geminiCalled: false,
    };
  }

  if (/blockers?|stuck|impediment/i.test(lowerQuery)) {
    metrics.geminiCallsAvoided++;
    return {
      projectId: project.projectId,
      name: project.name,
      currentState: project.currentState,
      queryType: "BLOCKERS",
      count: (project.blockers || []).length,
      items: project.blockers || [],
      summary: (project.blockers || []).length > 0
        ? `Found ${(project.blockers || []).length} blocker(s) for project ${project.name}.`
        : `No active blockers for project ${project.name}.`,
      geminiCalled: false,
    };
  }

  if (/decisions?|agreed/i.test(lowerQuery)) {
    metrics.geminiCallsAvoided++;
    return {
      projectId: project.projectId,
      name: project.name,
      currentState: project.currentState,
      queryType: "DECISIONS",
      count: (project.decisions || []).length,
      items: project.decisions || [],
      summary: (project.decisions || []).length > 0
        ? `Found ${(project.decisions || []).length} recorded decision(s) for project ${project.name}.`
        : `No recorded decisions found for project ${project.name}.`,
      geminiCalled: false,
    };
  }

  if (/who is working|people|team|assignees/i.test(lowerQuery)) {
    metrics.geminiCallsAvoided++;
    return {
      projectId: project.projectId,
      name: project.name,
      currentState: project.currentState,
      queryType: "PEOPLE",
      people: project.people || [],
      summary: (project.people || []).length > 0
        ? `Team members involved in ${project.name}: ${(project.people || []).join(", ")}.`
        : `No specific people recorded for ${project.name}.`,
      geminiCalled: false,
    };
  }

  // ── Semantic Synthesis Query (When general natural language synthesis is requested)
  metrics.geminiCallsMade++;
  let synthesis;

  if (getCooldownStatus().inCooldown) {
    synthesis = `Project ${project.name} is currently ${project.currentState} with ${(project.tasks || []).length} tasks, ${(project.blockers || []).length} blockers, and ${(project.decisions || []).length} decisions.`;
  } else {
    const prompt = `You are WAAA's Project Intelligence Assistant.
Answer this user question about Project ${project.name}:
Question: "${query}"

PROJECT CONTEXT:
- Name: ${project.name}
- State: ${project.currentState}
- People: ${(project.people || []).join(", ") || "None"}
- Tasks: ${JSON.stringify(project.tasks || [])}
- Actions: ${JSON.stringify(project.actions || [])}
- Blockers: ${JSON.stringify(project.blockers || [])}
- Decisions: ${JSON.stringify(project.decisions || [])}
- Recent Changes: ${project.recentChanges}

Provide a concise, factual, and direct answer. Do not hallucinate.`;

    synthesis = await askAI({
      system: "You are a concise project intelligence assistant. Answer factual queries based strictly on provided structured project data.",
      prompt,
      maxTokens: 500,
    });
  }

  return {
    projectId: project.projectId,
    name: project.name,
    currentState: project.currentState,
    queryType: "SEMANTIC_QUERY",
    summary: synthesis,
    project,
    geminiCalled: true,
  };
}
