/*
==============================================================================
WAAA - User Identity & Scoping Abstraction                            Phase 13
==============================================================================

Provides lightweight, robust user resolution for multi-tenant isolation.
Every request, session, data read/write, job, and retrieval resolves to a userId.
If no userId is provided, it falls back to the legacy "default_user" for
backward compatibility with existing Phase 1-12 data.
==============================================================================
*/

import { isValidSafeId } from "./securityUtils.js";

export const DEFAULT_USER_ID = "default_user";

/**
 * Resolves userId from request headers, query params, or body.
 * Headers checked: x-user-id, authorization (Bearer <userId>)
 * Fallback: DEFAULT_USER_ID
 *
 * @param {object} req - Express request object
 * @returns {string} Sanitized, validated userId
 */
export function resolveUserId(req) {
  if (!req) return DEFAULT_USER_ID;

  let raw = req.headers?.["x-user-id"] || req.query?.userId || req.body?.userId;

  if (!raw && req.headers?.authorization) {
    const auth = String(req.headers.authorization).trim();
    if (auth.startsWith("Bearer ")) {
      raw = auth.slice(7).trim();
    }
  }

  if (raw && typeof raw === "string") {
    const trimmed = raw.trim();
    if (isValidSafeId(trimmed) && trimmed.length <= 64) {
      return trimmed;
    }
  }

  return DEFAULT_USER_ID;
}

/**
 * Middleware that attaches req.userId to all incoming requests.
 */
export function userContextMiddleware(req, res, next) {
  req.userId = resolveUserId(req);
  next();
}
