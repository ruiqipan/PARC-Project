/**
 * POST /api/reviews/follow-up
 *
 * Triggered immediately after a user submits a review.
 * Runs the 4-Layer Recommendation Engine and returns 1–2 follow-up questions
 * formatted as "Statements for Confirmation" for the low-friction follow-up UI.
 *
 * Request body:
 *   { review_id: string, property_id: string, user_id: string }
 *
 * Response (200):
 *   FollowUpEngineResponse — see types/index.ts
 *
 * Response (400): missing or invalid request fields
 * Response (404): property not found in Description_PROC
 * Response (500): unexpected server error
 */

import type { NextRequest } from 'next/server';
import { runFollowUpEngine } from '@/lib/follow-up-engine';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  // Validate required fields.
  const { review_id, property_id, user_id } = (body ?? {}) as Record<string, unknown>;

  if (typeof review_id !== 'string' || !review_id.trim()) {
    return Response.json({ error: 'Missing required field: review_id' }, { status: 400 });
  }
  if (typeof property_id !== 'string' || !property_id.trim()) {
    return Response.json({ error: 'Missing required field: property_id' }, { status: 400 });
  }
  if (typeof user_id !== 'string' || !user_id.trim()) {
    return Response.json({ error: 'Missing required field: user_id' }, { status: 400 });
  }

  try {
    const result = await runFollowUpEngine({ review_id, property_id, user_id });
    return Response.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('not found in Description_PROC')) {
      return Response.json({ error: message }, { status: 404 });
    }

    console.error('[follow-up] engine error:', message);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
