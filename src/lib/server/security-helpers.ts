/**
 * src/lib/server/security-helpers.ts
 * ─────────────────────────────────────────────────────────────────
 * Reusable security-validation helpers for Member D's
 * POST /api/discovery/submit endpoint.
 * SERVER-ONLY — never import from client-side or browser code.
 *
 * ── Integration contract for Member D ────────────────────────────
 *
 *  import { validateSubmissionIntegrity } from '@/lib/server/security-helpers';
 *
 *  // Inside POST /api/discovery/submit:
 *  export async function POST(req: NextRequest): Promise<NextResponse> {
 *    const body = await req.json();
 *    const { powSolution, feeds } = body;
 *
 *    const security = await validateSubmissionIntegrity(req, powSolution);
 *    if (!security.ok) {
 *      return NextResponse.json(
 *        { error: security.message },
 *        { status: security.httpStatus }
 *      );
 *    }
 *
 *    // Security checks passed — continue with discovery logic
 *    // ...
 *  }
 *
 * ── Validation order ─────────────────────────────────────────────
 *  1. Input presence check (PoW solution fields present)
 *  2. Rate limit check     (cheap in-memory check first)
 *  3. PoW verification     (more expensive crypto check second)
 *
 *  Rate limit is checked before PoW so that bots cannot enumerate
 *  PoW solutions while hiding behind rate-limit resets.
 * ─────────────────────────────────────────────────────────────────
 */

import { verifyPoWChallenge, type PowVerifyError } from '@/lib/server/pow';
import { checkRateLimitBySaltedIp, extractClientIp } from '@/lib/server/rate-limiter';

// ─── Public types ─────────────────────────────────────────────────

/**
 * The PoW solution payload that the client must include in every
 * POST /api/discovery/submit request body.
 */
export interface PoWSolution {
  /** The `id` field from the PowChallenge issued by GET /api/pow/challenge. */
  challengeId: string;
  /** The nonce the client computed such that sha256(challenge+nonce) has the required prefix. */
  nonce: string;
}

/** Returned by validateSubmissionIntegrity on success. */
export interface SecurityCheckSuccess {
  ok: true;
}

/** Returned by validateSubmissionIntegrity on failure. */
export interface SecurityCheckFailure {
  ok: false;
  /** Human-readable error message safe to return to the client. */
  message: string;
  /** Appropriate HTTP status code for the failure. */
  httpStatus: 400 | 422 | 429 | 403;
  /** Machine-readable error code. */
  code: 'MISSING_POW' | 'RATE_LIMITED' | PowVerifyError;
}

export type SecurityCheckResult = SecurityCheckSuccess | SecurityCheckFailure;

// ─── Main validation function ─────────────────────────────────────

/**
 * Validate the security requirements for a discovery submission.
 *
 * Performs in order:
 *   1. Input validation — PoW solution fields must be present.
 *   2. Rate limit check — reject with 429 if IP exceeded quota.
 *   3. PoW verification — reject with 422 if challenge is invalid.
 *
 * Usage by Member D:
 *   const result = await validateSubmissionIntegrity(req, powSolution);
 *   if (!result.ok) {
 *     return NextResponse.json({ error: result.message }, { status: result.httpStatus });
 *   }
 *   // proceed with submission
 *
 * @param req          The raw Next.js Request (used for IP extraction).
 * @param powSolution  The PoW solution from the request body.
 */
export async function validateSubmissionIntegrity(
  req: Request,
  powSolution: PoWSolution,
): Promise<SecurityCheckResult> {
  // ── Step 1: Input presence check ────────────────────────────────
  if (
    !powSolution ||
    typeof powSolution.challengeId !== 'string' ||
    typeof powSolution.nonce !== 'string' ||
    !powSolution.challengeId.trim() ||
    !powSolution.nonce.trim()
  ) {
    return {
      ok: false,
      code: 'MISSING_POW',
      httpStatus: 400,
      message:
        'Request must include a valid Proof-of-Work solution with challengeId and nonce.',
    };
  }

  // ── Step 2: Rate limit check (cheap, checked before PoW) ────────
  const clientIp = extractClientIp(req);
  const withinLimit = checkRateLimitBySaltedIp(clientIp);
  if (!withinLimit) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      httpStatus: 429,
      message:
        'Rate limit exceeded. You may submit at most 10 times per hour. Please try again later.',
    };
  }

  // ── Step 3: PoW verification ────────────────────────────────────
  const powResult = verifyPoWChallenge(
    powSolution.challengeId,
    powSolution.nonce,
  );
  if (!powResult.ok) {
    return {
      ok: false,
      code: powResult.error,
      httpStatus: 422,
      message: powResult.message,
    };
  }

  return { ok: true };
}

// ─── Re-exports for convenience ───────────────────────────────────

// Member D can import these directly if they need finer control.
export { extractClientIp } from '@/lib/server/rate-limiter';
export { verifyPoWChallenge, generateChallenge } from '@/lib/server/pow';
export { checkRateLimitBySaltedIp } from '@/lib/server/rate-limiter';

