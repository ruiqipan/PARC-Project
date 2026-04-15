/**
 * POST /api/reviews/nlp-parse
 *
 * Uses OpenAI to extract a structured numeric score from a guest's spoken or
 * typed feedback about a specific hotel feature.
 *
 * Request body:
 *   transcript   — the raw voice/text input from the guest
 *   ui_type      — 'Slider' | 'Agreement' (QuickTag is rejected; returns null)
 *   feature_name — machine key, e.g. 'wifi', 'noise'
 *   prompt       — the question text shown to the guest
 *   left_label?  — Slider left-pole label (e.g. "Very Slow")
 *   right_label? — Slider right-pole label (e.g. "Blazing Fast")
 *
 * Response:
 *   { quantitative_value: number | null }
 *   Slider    → 0.0–1.0  (0.0 = left pole worst, 1.0 = right pole best)
 *   Agreement → 1–5 integer (1 = strongly disagree, 5 = strongly agree)
 */

import OpenAI from 'openai';
import type { NextRequest } from 'next/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You extract a numeric score from a hotel guest's spoken or written feedback about a specific hotel feature.

Return ONLY valid JSON with this exact shape:
{ "quantitative_value": <number or null> }

Scoring rules:
- For ui_type "Slider": return a decimal between 0.0 and 1.0.
  0.0 = the left_label pole (worst / slowest / noisiest etc.)
  1.0 = the right_label pole (best / fastest / quietest etc.)
  0.5 = neutral / mixed / in-between
- For ui_type "Agreement": return an integer 1–5.
  1 = strongly disagree, 2 = disagree, 3 = neutral, 4 = agree, 5 = strongly agree

Interpretation guidance:
- Hedging words ("sometimes", "occasionally", "inconsistent", "hit or miss") → middling score (0.4–0.6 for Slider, 3 for Agreement)
- Negation flips direction: "not slow" = fast, "not bad" = good
- Strong positives ("amazing", "perfect", "blazing fast") → 0.9–1.0 or 5
- Strong negatives ("terrible", "unusable", "couldn't connect") → 0.0–0.1 or 1
- If the feedback is off-topic, too vague, or doesn't address the feature at all → return null`;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const transcript  = typeof b.transcript   === 'string' ? b.transcript.trim()   : '';
  const ui_type     = typeof b.ui_type      === 'string' ? b.ui_type             : '';
  const feature_name = typeof b.feature_name === 'string' ? b.feature_name.trim() : '';
  const prompt_text = typeof b.prompt       === 'string' ? b.prompt.trim()       : '';
  const left_label  = typeof b.left_label   === 'string' ? b.left_label.trim()   : '';
  const right_label = typeof b.right_label  === 'string' ? b.right_label.trim()  : '';

  if (!transcript) {
    return Response.json({ error: 'Missing transcript.' }, { status: 400 });
  }

  if (!ui_type || !feature_name) {
    return Response.json({ error: 'Missing ui_type or feature_name.' }, { status: 400 });
  }

  // QuickTag has no numeric meaning — skip AI entirely
  if (ui_type !== 'Slider' && ui_type !== 'Agreement') {
    return Response.json({ quantitative_value: null });
  }

  const contextLines = [
    `feature: ${feature_name}`,
    `ui_type: ${ui_type}`,
    prompt_text ? `question: ${prompt_text}` : '',
    ui_type === 'Slider' && left_label  ? `left_label  (0.0): ${left_label}`  : '',
    ui_type === 'Slider' && right_label ? `right_label (1.0): ${right_label}` : '',
    `guest feedback: "${transcript}"`,
  ].filter(Boolean).join('\n');

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: contextLines  },
      ],
      max_tokens: 60,
      temperature: 0,
    });

    const content = completion.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as { quantitative_value?: unknown };
    const raw = parsed.quantitative_value;

    if (raw === null || raw === undefined) {
      return Response.json({ quantitative_value: null });
    }

    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return Response.json({ quantitative_value: null });
    }

    let value: number;
    if (ui_type === 'Slider') {
      value = Math.round(clamp(raw, 0, 1) * 100) / 100;
    } else {
      // Agreement: 1–5 integer
      value = Math.round(clamp(raw, 1, 5));
    }

    return Response.json({ quantitative_value: value });
  } catch (error) {
    console.error('[nlp-parse] OpenAI call failed:', error);
    return Response.json({ error: 'NLP parse failed.' }, { status: 500 });
  }
}
