/*
==============================================================================
WAAA - Proof Manager & Tamper Verification Layer                      Phase 15
==============================================================================

Manages the lifecycle of cryptographic proofs for WAAA intelligence:
  - Generates proof records with canonical SHA-256 hashes
  - Stores proofs in user-isolated storage: data/users/<userId>/proofs.json
  - Submits proofs to blockchain asynchronously via Phase 6 jobManager
  - Verifies local intelligence records against stored proof hashes (tamper detection)
  - Returns verification status: VERIFIED, TAMPERED, NOT_FOUND, PENDING, BLOCKCHAIN_UNAVAILABLE
==============================================================================
*/

import { readCollection, writeCollection, genId } from "../db/localStore.js";
import { computeContentHash } from "./hashUtils.js";
import { submitProofToBlockchain, verifyOnChainProof } from "./blockchainAdapter.js";
import { isValidSafeId } from "../intelligence/securityUtils.js";

const COLLECTION = "proofs";

export const PROOF_STATUS = Object.freeze({
  LOCAL_VERIFIED: "LOCAL_VERIFIED",
  ON_CHAIN_CONFIRMED: "ON_CHAIN_CONFIRMED",
  PENDING_SUBMISSION: "PENDING_SUBMISSION",
  FAILED: "FAILED",
});

export const VERIFICATION_RESULT = Object.freeze({
  VERIFIED: "VERIFIED",
  TAMPERED: "TAMPERED",
  NOT_FOUND: "NOT_FOUND",
  PENDING: "PENDING",
  BLOCKCHAIN_UNAVAILABLE: "BLOCKCHAIN_UNAVAILABLE",
});

export const PROOF_TYPES = Object.freeze({
  SUMMARY: "summary",
  DECISION: "decision",
  ACTION: "action",
  PROJECT_SNAPSHOT: "project_snapshot",
  MEDIA_ANALYSIS: "media_analysis",
  AUDIT_CHECKPOINT: "audit_checkpoint",
});

/**
 * Loads user proofs.
 */
export async function loadUserProofs(userId = "default_user") {
  return readCollection(COLLECTION, userId);
}

/**
 * Saves user proofs.
 */
export async function saveUserProofs(proofs, userId = "default_user") {
  return writeCollection(COLLECTION, proofs, userId);
}

/**
 * Creates and registers a cryptographic proof for a record.
 * Idempotent: if identical contentHash exists for the record, returns existing proof.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.proofType - One of PROOF_TYPES
 * @param {string} params.recordType - e.g. "summary", "decision", "action", "media"
 * @param {string} params.recordId
 * @param {object} params.recordData - The record payload to hash
 * @param {boolean} [params.submitToChain=true] - Attempt on-chain registration
 * @returns {Promise<object>} The proof record
 */
export async function createProof({
  userId = "default_user",
  proofType = PROOF_TYPES.AUDIT_CHECKPOINT,
  recordType,
  recordId,
  recordData,
  submitToChain = true,
}) {
  if (!isValidSafeId(userId)) {
    throw new Error(`[proofManager] Invalid userId: "${userId}"`);
  }
  if (!recordType || !recordId || !recordData) {
    throw new Error("[proofManager] recordType, recordId, and recordData are required.");
  }

  // 1. Compute deterministic canonical hash
  const contentHash = computeContentHash(recordData);
  const now = new Date().toISOString();

  // 2. Load existing user proofs
  const proofs = await loadUserProofs(userId);

  // Check for existing matching proof (Idempotency)
  const existing = proofs.find(
    (p) => p.recordType === recordType && p.recordId === recordId && p.contentHash === contentHash
  );
  if (existing) {
    return existing;
  }

  const proofId = "proof_" + genId();

  // 3. Construct new proof record
  const newProof = {
    proofId,
    userId,
    proofType,
    recordType,
    recordId,
    contentHash,
    status: PROOF_STATUS.LOCAL_VERIFIED,
    blockchainNetwork: null,
    transactionId: null,
    blockNumber: null,
    submittedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  // 4. Optionally submit to blockchain
  if (submitToChain) {
    try {
      const chainResult = await submitProofToBlockchain({
        proofId,
        contentHash,
        proofType,
        userId,
      });

      if (chainResult.submitted) {
        newProof.status = PROOF_STATUS.ON_CHAIN_CONFIRMED;
        newProof.blockchainNetwork = chainResult.network;
        newProof.transactionId = chainResult.transactionId;
        newProof.blockNumber = chainResult.blockNumber;
        newProof.submittedAt = chainResult.timestamp || now;
      }
    } catch (err) {
      console.warn(`[proofManager] On-chain submission delayed for ${proofId}:`, err.message);
      newProof.status = PROOF_STATUS.PENDING_SUBMISSION;
    }
  }

  proofs.push(newProof);
  await saveUserProofs(proofs, userId);

  return newProof;
}

/**
 * Verifies a record against stored cryptographic proofs and detects tampering.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.recordType
 * @param {string} params.recordId
 * @param {object} params.currentRecordData
 * @param {string} [params.proofId]
 * @returns {Promise<object>} Verification report
 */
export async function verifyRecordIntegrity({
  userId = "default_user",
  recordType,
  recordId,
  currentRecordData,
  proofId = null,
}) {
  const proofs = await loadUserProofs(userId);

  // Locate the relevant proof
  let proof = null;
  if (proofId) {
    proof = proofs.find((p) => p.proofId === proofId && p.userId === userId);
  } else {
    // Find latest proof for this recordId
    const matching = proofs
      .filter((p) => p.recordType === recordType && p.recordId === recordId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    proof = matching[0] || null;
  }

  if (!proof) {
    return {
      status: VERIFICATION_RESULT.NOT_FOUND,
      verified: false,
      message: "No proof found for this record.",
    };
  }

  // Recalculate content hash
  const recalculatedHash = computeContentHash(currentRecordData);

  if (recalculatedHash !== proof.contentHash) {
    return {
      status: VERIFICATION_RESULT.TAMPERED,
      verified: false,
      proofId: proof.proofId,
      recordId,
      recordType,
      expectedHash: proof.contentHash,
      actualHash: recalculatedHash,
      message: "Integrity check failed: Record content has been modified since proof creation.",
    };
  }

  // Check on-chain proof if available
  let onChain = null;
  try {
    onChain = await verifyOnChainProof(proof.contentHash);
  } catch {
    onChain = { available: false };
  }

  return {
    status: VERIFICATION_RESULT.VERIFIED,
    verified: true,
    proofId: proof.proofId,
    recordId,
    recordType,
    contentHash: proof.contentHash,
    createdAt: proof.createdAt,
    statusLevel: proof.status,
    onChainDetails: onChain?.registered ? onChain : null,
    message: "Record integrity verified successfully.",
  };
}

/**
 * Retrieves a single proof by proofId for a user.
 */
export async function getProofById(proofId, userId = "default_user") {
  const proofs = await loadUserProofs(userId);
  return proofs.find((p) => p.proofId === proofId && p.userId === userId) || null;
}
