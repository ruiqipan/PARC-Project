import type { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { FollowUpAnswer } from '@/types';

function isValidUiType(value: unknown): value is FollowUpAnswer['ui_type'] {
  return value === 'Slider' || value === 'Agreement' || value === 'QuickTag';
}

function normaliseQuantitativeValue(uiType: FollowUpAnswer['ui_type'], value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (uiType === 'Slider') {
    return Math.max(0, Math.min(1, value));
  }

  if (uiType === 'Agreement') {
    return Math.max(1, Math.min(5, Math.round(value)));
  }

  return null;
}

function normaliseAnswer(answer: unknown): FollowUpAnswer | null {
  if (!answer || typeof answer !== 'object') {
    return null;
  }

  const candidate = answer as Record<string, unknown>;
  const feature_name = typeof candidate.feature_name === 'string' ? candidate.feature_name.trim() : '';
  const qualitative_note =
    typeof candidate.qualitative_note === 'string' && candidate.qualitative_note.trim()
      ? candidate.qualitative_note.trim()
      : null;

  if (!feature_name || !isValidUiType(candidate.ui_type)) {
    return null;
  }

  return {
    feature_name,
    ui_type: candidate.ui_type,
    quantitative_value: normaliseQuantitativeValue(candidate.ui_type, candidate.quantitative_value),
    qualitative_note,
  };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const review_id = typeof (body as Record<string, unknown>)?.review_id === 'string'
    ? (body as Record<string, string>).review_id.trim()
    : '';
  const rawAnswers = Array.isArray((body as Record<string, unknown>)?.answers)
    ? ((body as Record<string, unknown>).answers as unknown[])
    : [];

  if (!review_id) {
    return Response.json({ error: 'Missing required field: review_id' }, { status: 400 });
  }

  const answers = rawAnswers
    .map(normaliseAnswer)
    .filter((answer): answer is FollowUpAnswer => answer !== null);

  if (answers.length === 0) {
    return Response.json({ error: 'At least one valid follow-up answer is required.' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const rows = answers.map(answer => ({
      review_id,
      feature_name: answer.feature_name,
      ui_type: answer.ui_type,
      quantitative_value: answer.quantitative_value,
      qualitative_note: answer.qualitative_note,
    }));

    const { error } = await supabase.from('FollowUp_Answers').insert(rows);
    if (error) {
      throw error;
    }

    return Response.json({ ok: true, inserted: rows.length });
  } catch (error) {
    console.error('[follow-up/answers] failed:', error);
    return Response.json({ error: 'Unable to save follow-up answers right now.' }, { status: 500 });
  }
}
