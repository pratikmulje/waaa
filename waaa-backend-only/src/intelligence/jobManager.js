/*
==============================================================================
WAAA - Checkpointing + Gemini API Rotation / Resumable Jobs           Phase 6
==============================================================================

Persistent, resumable job runner with unit-level checkpointing, multi-key
Gemini rotation, failure classification, concurrency safety, and crash
recovery.

ARCHITECTURE & GUARANTEES:
1. Unit-level Checkpointing:
   Persists progress to data/jobs.json immediately after EVERY completed unit.
2. Exact Resume:
   Resuming an interrupted/paused job starts from the exact uncompleted unit,
   skipping all already finished units (ZERO duplicate Gemini calls).
3. Failure Classification:
   - QUOTA_EXHAUSTED / AUTH_INVALID: Rotates Gemini key; pauses with checkpoint
     if all keys exhausted.
   - TRANSIENT_NETWORK: Backoff retry up to 3 times before pausing.
   - PERMANENT_REQUEST: Marks unit failed, logs error, advances to next unit.
4. Concurrency Protection:
   Only one worker can run a job at a time via atomic TTL lock.
5. Server Restart Recovery:
   Automatically detects and cleans up interrupted running jobs on boot.
==============================================================================
*/

import { readCollection, writeCollection, genId, withCollectionLock } from "../db/localStore.js";
import {
  classifyGeminiError,
  ERROR_TYPES,
  getCurrentKeyIndex,
  getExhaustedKeysList,
  rotateKeyManual,
  getKeyStatus,
} from "../ai/geminiClient.js";

const COLLECTION = "jobs";
const DEFAULT_LOCK_TTL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_TRANSIENT_RETRIES = 3;

// ── Registry for Job Unit Executors ──────────────────────────────────────────
const executorRegistry = new Map();

export function registerJobExecutor(type, fn) {
  executorRegistry.set(type, fn);
}

// ── Storage Operations ────────────────────────────────────────────────────────

export async function loadJobs() {
  return readCollection(COLLECTION);
}

async function saveJobs(jobs) {
  return writeCollection(COLLECTION, jobs);
}

export async function getJob(jobId) {
  const jobs = await loadJobs();
  return jobs.find((j) => j.jobId === jobId) || null;
}

// ── Job Creation ──────────────────────────────────────────────────────────────

/**
 * Creates a new job with initial units.
 *
 * @param {object} params
 * @param {string} params.type - Job type ("summarize_chunks" | "summarize_chats" | custom)
 * @param {Array<object>} params.units - Array of unit objects, e.g. [{ id: "chunk_1", chatId: "..." }]
 * @param {object} [params.metadata] - Optional additional info
 * @returns {Promise<object>} The created job
 */
export async function createJob({ type, units = [], metadata = {}, userId = "default_user" }) {
  const now = new Date().toISOString();
  const jobId = "job_" + genId();

  const formattedUnits = units.map((u, index) => ({
    index,
    id: u.id || `unit_${index}`,
    chatId: u.chatId || null,
    data: u.data || u,
    status: "pending", // "pending" | "done" | "failed"
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  }));

  const newJob = {
    jobId,
    userId,
    type,
    status: "pending", // "pending" | "running" | "paused" | "done" | "failed"
    currentChatId: formattedUnits[0]?.chatId || null,
    currentUnitIndex: 0,
    totalUnits: formattedUnits.length,
    processedUnits: 0,
    processedChats: [],
    processedChunks: [],
    units: formattedUnits,
    currentKeyIndex: getCurrentKeyIndex(),
    exhaustedKeys: getExhaustedKeysList(),
    lastSuccessAt: null,
    lastError: null,
    lock: null,
    metadata,
    createdAt: now,
    updatedAt: now,
  };

  const jobs = await loadJobs();
  jobs.push(newJob);
  await saveJobs(jobs);

  return newJob;
}

// ── Concurrency & Locking ─────────────────────────────────────────────────────

/**
 * Atomically acquires lock for a job.
 */
export async function acquireJobLock(jobId, workerId, ttlMs = DEFAULT_LOCK_TTL_MS) {
  const jobs = await loadJobs();
  const job = jobs.find((j) => j.jobId === jobId);
  if (!job) return false;

  const now = Date.now();
  const lockExpires = job.lock?.expiresAt ? new Date(job.lock.expiresAt).getTime() : 0;

  // Lock is free if null or expired or already held by this worker
  if (!job.lock || lockExpires < now || job.lock.workerId === workerId) {
    job.lock = {
      workerId,
      acquiredAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
    };
    job.updatedAt = new Date(now).toISOString();
    await saveJobs(jobs);
    return true;
  }

  return false; // Lock held by another active worker
}

/**
 * Releases job lock.
 */
export async function releaseJobLock(jobId, workerId) {
  const jobs = await loadJobs();
  const job = jobs.find((j) => j.jobId === jobId);
  if (!job) return false;

  if (job.lock && (job.lock.workerId === workerId || !workerId)) {
    job.lock = null;
    job.updatedAt = new Date().toISOString();
    await saveJobs(jobs);
    return true;
  }
  return false;
}

// ── Job Pause ─────────────────────────────────────────────────────────────────

export async function pauseJob(jobId, reason = "Paused by user request") {
  const jobs = await loadJobs();
  const job = jobs.find((j) => j.jobId === jobId);
  if (!job) return { ok: false, error: "Job not found" };

  if (job.status === "done" || job.status === "failed") {
    return { ok: false, error: `Cannot pause job in status: ${job.status}` };
  }

  job.status = "paused";
  job.lastError = { classifiedAs: "PAUSED", message: reason, at: new Date().toISOString() };
  job.lock = null; // Free lock on pause
  job.updatedAt = new Date().toISOString();
  await saveJobs(jobs);

  return { ok: true, job };
}

// ── Job Runner & Checkpointer ─────────────────────────────────────────────────

/**
 * Runs or resumes a job from its exact persisted checkpoint.
 *
 * @param {string} jobId
 * @param {object} [options]
 * @param {string} [options.workerId] - Unique ID for worker
 * @param {Function} [options.executor] - Optional custom executor function
 * @returns {Promise<object>} The finished or paused job status
 */
export async function runJob(jobId, options = {}) {
  const workerId = options.workerId || "worker_" + genId();

  // 1. Acquire Lock
  const locked = await acquireJobLock(jobId, workerId);
  if (!locked) {
    throw new Error(`Concurrency violation: Job ${jobId} is currently locked by another worker.`);
  }

  try {
    // 2. Load Job State
    let jobs = await loadJobs();
    let job = jobs.find((j) => j.jobId === jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    if (job.status === "done") {
      await releaseJobLock(jobId, workerId);
      return job;
    }

    // Set status to running
    job.status = "running";
    job.updatedAt = new Date().toISOString();
    await saveJobs(jobs);

    // Resolve executor
    const executor =
      options.executor ||
      executorRegistry.get(job.type) ||
      (async (unit) => ({ message: `Executed unit ${unit.id}` }));

    // 3. Process units starting from first uncompleted unit
    for (let i = 0; i < job.units.length; i++) {
      // Re-read latest job state from store to ensure synchronization
      jobs = await loadJobs();
      job = jobs.find((j) => j.jobId === jobId);
      if (!job) break;

      if (job.status === "paused" || job.status === "cancelled") {
        console.log(`[JobManager] Job ${jobId} is currently ${job.status}. Halting worker loop.`);
        return job;
      }

      const unit = job.units[i];

      // SKIP ALREADY COMPLETED OR FAILED UNITS (EXACT RESUME GUARANTEE)
      if (unit.status === "done" || unit.status === "failed") {
        continue;
      }

      job.currentUnitIndex = i;
      job.currentChatId = unit.chatId || job.currentChatId;
      unit.startedAt = new Date().toISOString();

      let unitSuccess = false;
      let transientRetryCount = 0;

      while (!unitSuccess) {
        try {
          // Execute the unit
          const result = await executor(unit, job);

          // ── Unit Success: Record & Checkpoint IMMEDIATELY ──
          unit.status = "done";
          unit.result = result || { ok: true };
          unit.error = null;
          unit.completedAt = new Date().toISOString();

          job.processedUnits = job.units.filter((u) => u.status === "done").length;
          if (unit.chatId && !job.processedChats.includes(unit.chatId)) {
            job.processedChats.push(unit.chatId);
          }
          if (unit.id && !job.processedChunks.includes(unit.id)) {
            job.processedChunks.push(unit.id);
          }
          job.lastSuccessAt = new Date().toISOString();
          job.lastError = null;
          job.currentKeyIndex = getCurrentKeyIndex();
          job.exhaustedKeys = getExhaustedKeysList();
          job.updatedAt = new Date().toISOString();

          // Refresh lock expiration
          if (job.lock) {
            job.lock.expiresAt = new Date(Date.now() + DEFAULT_LOCK_TTL_MS).toISOString();
          }

          // IMMEDIATE ATOMIC WRITE TO DISK
          await saveJobs(jobs);
          unitSuccess = true;
        } catch (err) {
          const errorType = classifyGeminiError(err);
          const errorMsg = String(err?.message || err);

          console.warn(`[JobManager] Error executing unit ${unit.id}: [${errorType}] ${errorMsg}`);

          if (errorType === ERROR_TYPES.QUOTA_EXHAUSTED || errorType === ERROR_TYPES.AUTH_INVALID) {
            // Rotate API key
            const rotated = rotateKeyManual();
            job.currentKeyIndex = getCurrentKeyIndex();
            job.exhaustedKeys = getExhaustedKeysList();

            if (!rotated) {
              // All keys exhausted -> Pause job with checkpoint
              console.warn(`[JobManager] ⏸️ All keys exhausted. Pausing Job ${jobId} at checkpoint unit ${i}.`);
              job.status = "paused";
              job.lastError = {
                classifiedAs: errorType,
                message: "All Gemini API keys exhausted for today. Resumable after cooldown/midnight reset.",
                failedUnitId: unit.id,
                at: new Date().toISOString(),
              };
              job.updatedAt = new Date().toISOString();
              await saveJobs(jobs);
              return job;
            }

            console.log(`[JobManager] 🔄 Rotated to key #${job.currentKeyIndex + 1}. Retrying unit ${unit.id}...`);
            // Loop continues to retry unit with next key
          } else if (errorType === ERROR_TYPES.TRANSIENT_NETWORK) {
            transientRetryCount++;
            if (transientRetryCount <= MAX_TRANSIENT_RETRIES) {
              const backoffMs = Math.min(1000 * Math.pow(2, transientRetryCount - 1), 5000);
              console.log(`[JobManager] Transient network error. Retrying unit ${unit.id} in ${backoffMs}ms (attempt ${transientRetryCount}/${MAX_TRANSIENT_RETRIES})...`);
              await new Promise((r) => setTimeout(r, backoffMs));
              // Retry
            } else {
              // Transient retries exceeded -> Pause job with checkpoint
              console.error(`[JobManager] Max network retries exceeded for unit ${unit.id}. Pausing job.`);
              job.status = "paused";
              job.lastError = {
                classifiedAs: errorType,
                message: `Transient network failure after ${MAX_TRANSIENT_RETRIES} retries: ${errorMsg}`,
                failedUnitId: unit.id,
                at: new Date().toISOString(),
              };
              job.updatedAt = new Date().toISOString();
              await saveJobs(jobs);
              return job;
            }
          } else if (errorType === ERROR_TYPES.PERMANENT_REQUEST) {
            // Permanent request failure -> mark unit as failed, advance to next unit without infinite loop
            console.error(`[JobManager] Permanent failure on unit ${unit.id}: ${errorMsg}. Advancing checkpoint.`);
            unit.status = "failed";
            unit.error = errorMsg;
            unit.completedAt = new Date().toISOString();
            job.lastError = {
              classifiedAs: errorType,
              message: errorMsg,
              failedUnitId: unit.id,
              at: new Date().toISOString(),
            };
            job.updatedAt = new Date().toISOString();
            await saveJobs(jobs);
            unitSuccess = true; // Break while loop and proceed to next unit
          } else {
            // Unknown error -> mark unit failed and advance
            unit.status = "failed";
            unit.error = errorMsg;
            unit.completedAt = new Date().toISOString();
            job.lastError = {
              classifiedAs: ERROR_TYPES.UNKNOWN,
              message: errorMsg,
              failedUnitId: unit.id,
              at: new Date().toISOString(),
            };
            job.updatedAt = new Date().toISOString();
            await saveJobs(jobs);
            unitSuccess = true;
          }
        }
      }
    }

    // 4. Check if all units completed
    jobs = await loadJobs();
    job = jobs.find((j) => j.jobId === jobId);
    if (job && job.status === "running") {
      const allDoneOrFailed = job.units.every((u) => u.status === "done" || u.status === "failed");
      if (allDoneOrFailed) {
        job.status = job.units.some((u) => u.status === "failed") ? "done_with_errors" : "done";
        job.updatedAt = new Date().toISOString();
        await saveJobs(jobs);
      }
    }

    return job;
  } finally {
    await releaseJobLock(jobId, workerId);
  }
}

// ── Server Recovery ───────────────────────────────────────────────────────────

/**
 * Scans for jobs interrupted by server restart and resets stale locks / status.
 */
export async function recoverInterruptedJobs() {
  const jobs = await loadJobs();
  let recoveredCount = 0;

  const now = new Date().toISOString();
  for (const job of jobs) {
    if (job.status === "running") {
      console.log(`[JobManager] 🛠️ Recovering interrupted job ${job.jobId} (was 'running' when process stopped)`);
      job.status = "paused";
      job.lock = null;
      job.lastError = {
        classifiedAs: "SERVER_RECOVERY",
        message: "Interrupted by server restart. Ready to resume from checkpoint.",
        at: now,
      };
      job.updatedAt = now;
      recoveredCount++;
    } else if (job.lock) {
      // Clear stale locks on any non-running jobs
      job.lock = null;
      job.updatedAt = now;
    }
  }

  if (recoveredCount > 0) {
    await saveJobs(jobs);
  }
  return { recoveredCount };
}

// ── Register Default Executors ────────────────────────────────────────────────

// 1. Chunk Summarizer Executor
registerJobExecutor("summarize_chunks", async (unit) => {
  const { summarizeChunk } = await import("./chunkSummarizer.js");
  return summarizeChunk(unit.id);
});

// 2. Chat Summarizer Executor
registerJobExecutor("summarize_chats", async (unit) => {
  const { updateChatSummary } = await import("./chatSummarizer.js");
  return updateChatSummary(unit.chatId, { ignoreRateLimit: true });
});

// 3. Range Summarizer Executor (Phase 7)
registerJobExecutor("summarize_range", async (unit) => {
  const { summarizeChatRange } = await import("./rangeSummarizer.js");
  return summarizeChatRange(unit.chatId, unit.range || { startAt: unit.startAt, endAt: unit.endAt }, {
    force: unit.force || false,
    ignoreCooldown: unit.ignoreCooldown || false,
  });
});

// 4. Action Extraction Executor (Phase 8)
registerJobExecutor("extract_actions", async (unit) => {
  const { extractActionIntelligence } = await import("./actionExtractor.js");
  return extractActionIntelligence({ chatId: unit.chatId });
});

// 5. Project Sync Executor (Phase 8)
registerJobExecutor("sync_projects", async (unit) => {
  const { syncProjects } = await import("./projectIntelligence.js");
  return syncProjects();
});

// 6. Watch Evaluation Executor (Phase 9)
registerJobExecutor("evaluate_watches", async (unit) => {
  const { evaluateWatches } = await import("./watchManager.js");
  const { processWatchMatches } = await import("./alertEngine.js");
  const event = unit.data?.event || unit.event;
  if (!event) return { skipped: true, reason: "No event provided" };
  const matches = await evaluateWatches(event);
  const result = await processWatchMatches(matches);
  return { matches: matches.length, ...result };
});

// 7. Media Processing Executor (Phase 10)
// unit.data = { messageId, chatId, chatName, sender, senderJid, receivedAt,
//               mimeType, fileSizeBytes, tier, bufferBase64 }
registerJobExecutor("process_media", async (unit) => {
  const { processMedia } = await import("./mediaProcessor.js");
  const d = unit.data || {};
  // Reconstruct buffer from base64 if provided (serialized through job store)
  const buffer = d.bufferBase64 ? Buffer.from(d.bufferBase64, "base64") : null;
  const result = await processMedia({
    messageId:     d.messageId,
    chatId:        d.chatId,
    chatName:      d.chatName,
    sender:        d.sender,
    senderJid:     d.senderJid,
    receivedAt:    d.receivedAt,
    mimeType:      d.mimeType,
    fileSizeBytes: d.fileSizeBytes,
    tier:          d.tier,
    buffer,
  });
  return { status: result.status, mediaType: result.mediaType, geminiCalled: result.geminiCalled };
});

// 8. Blockchain Proof Submission Executor (Phase 15)
// Asynchronously generates or anchors cryptographic proofs without blocking WhatsApp ingestion
registerJobExecutor("submit_blockchain_proof", async (unit) => {
  const { createProof } = await import("../blockchain/proofManager.js");
  const d = unit.data || {};
  const result = await createProof({
    userId:        d.userId || unit.userId || "default_user",
    proofType:     d.proofType,
    recordType:    d.recordType,
    recordId:      d.recordId,
    recordData:    d.recordData,
    submitToChain: d.submitToChain !== false,
  });
  return { status: "PROVEN", proofId: result.proofId, contentHash: result.contentHash, proofStatus: result.status };
});

