/*
==============================================================================
WAAA - Blockchain Proof & Verification Routes                         Phase 15
==============================================================================

Exposes REST endpoints for:
  - POST /api/blockchain/proofs         -> Generate proof for an intelligence record
  - GET  /api/blockchain/proofs         -> List proofs for the current user
  - GET  /api/blockchain/proofs/:proofId -> Get single proof details
  - POST /api/blockchain/verify         -> Verify record integrity & detect tampering
  - GET  /api/blockchain/status         -> Blockchain adapter connectivity & config
==============================================================================
*/

import { Router } from "express";
import {
  createProof,
  verifyRecordIntegrity,
  getProofById,
  loadUserProofs,
  PROOF_TYPES,
} from "../../blockchain/proofManager.js";
import {
  getBlockchainConfig,
  isBlockchainAvailable,
} from "../../blockchain/blockchainAdapter.js";
import { isValidSafeId, sanitizeErrorMessage } from "../../intelligence/securityUtils.js";

const router = Router();

/**
 * GET /api/blockchain/status
 * Returns current status of the blockchain proof adapter.
 */
router.get("/status", (req, res) => {
  try {
    const config = getBlockchainConfig();
    const available = isBlockchainAvailable();
    return res.json({
      ok: true,
      enabled: config.enabled,
      network: config.network,
      configured: config.configured,
      available,
    });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err.message) });
  }
});

/**
 * POST /api/blockchain/proofs
 * Create a deterministic cryptographic proof for a record.
 * Body: { recordType, recordId, recordData, proofType, submitToChain }
 */
router.post("/proofs", async (req, res) => {
  try {
    const userId = req.userId || "default_user";
    const { recordType, recordId, recordData, proofType, submitToChain } = req.body || {};

    if (!recordType || typeof recordType !== "string") {
      return res.status(400).json({ error: "recordType is required and must be a string." });
    }
    if (!recordId || typeof recordId !== "string") {
      return res.status(400).json({ error: "recordId is required and must be a string." });
    }
    if (!recordData || typeof recordData !== "object") {
      return res.status(400).json({ error: "recordData is required and must be an object." });
    }

    const proof = await createProof({
      userId,
      proofType: proofType || PROOF_TYPES.AUDIT_CHECKPOINT,
      recordType,
      recordId,
      recordData,
      submitToChain: submitToChain !== false,
    });

    return res.status(201).json({ ok: true, proof });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err.message) });
  }
});

/**
 * GET /api/blockchain/proofs
 * List all proofs for the authenticated user.
 */
router.get("/proofs", async (req, res) => {
  try {
    const userId = req.userId || "default_user";
    const proofs = await loadUserProofs(userId);
    return res.json({ ok: true, proofs, count: proofs.length });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err.message) });
  }
});

/**
 * GET /api/blockchain/proofs/:proofId
 * Retrieve a single proof by ID.
 */
router.get("/proofs/:proofId", async (req, res) => {
  try {
    const userId = req.userId || "default_user";
    const { proofId } = req.params;

    if (!proofId || !isValidSafeId(proofId)) {
      return res.status(400).json({ error: "Invalid proofId format." });
    }

    const proof = await getProofById(proofId, userId);
    if (!proof) {
      return res.status(404).json({ error: `Proof "${proofId}" not found.` });
    }

    return res.json({ ok: true, proof });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err.message) });
  }
});

/**
 * POST /api/blockchain/verify
 * Verify record integrity against stored cryptographic proofs (detect tampering).
 * Body: { recordType, recordId, currentRecordData, proofId }
 */
router.post("/verify", async (req, res) => {
  try {
    const userId = req.userId || "default_user";
    const { recordType, recordId, currentRecordData, proofId } = req.body || {};

    if (!currentRecordData || typeof currentRecordData !== "object") {
      return res.status(400).json({ error: "currentRecordData is required and must be an object." });
    }

    const verification = await verifyRecordIntegrity({
      userId,
      recordType,
      recordId,
      currentRecordData,
      proofId,
    });

    return res.json({ ok: true, ...verification });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err.message) });
  }
});

export default router;
