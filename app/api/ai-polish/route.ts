import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── System prompt ─────────────────────────────────────────────────────────────
// CRITICAL: anti-hallucination guardrails are enforced here.
// The model is strictly forbidden from inventing any fact not present in the
// raw input text, no matter how plausible it might seem.
const SYSTEM_PROMPT = `You are an expert hotel-review editor. Your sole task is to reformat a guest's raw, conversational notes into a clear, well-structured hotel review.

ABSOLUTE RULES — violating any of these is unacceptable:
1. NEVER invent, add, or infer ANY fact, amenity, detail, sentiment, or experience that is not explicitly stated in the raw input. If the guest did not mention it, it does not exist.
2. NEVER embellish or exaggerate. Do not upgrade "okay" to "excellent" or "small room" to "cozy room."
3. NEVER include generic filler praise (e.g., "great hotel overall," "highly recommended") unless the guest literally wrote those words.
4. NEVER correct factual claims made by the guest, even if they seem unlikely.
5. Only restructure and rephrase what is already there. You are a copyeditor, not a ghostwriter.

OUTPUT FORMAT:
- Return exactly 2–4 complete, grammatically correct sentences.
- Write in first person ("I", "we") if the input is first person; otherwise use neutral third person.
- Maintain the guest's overall tone (positive, negative, mixed) exactly as expressed.
- Output plain text only — no markdown, no bullet points, no headings.
- Do not add a rating, score, or star count.

If the raw input is too short or ambiguous to form a coherent review, return the input lightly cleaned up into 1–2 sentences without adding anything new.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawText: string | undefined = body?.rawText;

    if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
      return Response.json({ error: 'rawText is required' }, { status: 400 });
    }

    if (rawText.trim().length > 4000) {
      return Response.json({ error: 'rawText exceeds maximum length of 4000 characters' }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3, // low temperature to discourage creative invention
      max_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Raw guest notes:\n"""\n${rawText.trim()}\n"""\n\nPolished review:`,
        },
      ],
    });

    const polishedText = completion.choices[0]?.message?.content?.trim() ?? '';

    if (!polishedText) {
      return Response.json({ error: 'AI returned an empty response' }, { status: 502 });
    }

    return Response.json({ polishedText });
  } catch (err: unknown) {
    console.error('[ai-polish] error:', err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: message }, { status: 500 });
  }
}
