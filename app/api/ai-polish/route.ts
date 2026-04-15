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
- Return a fuller polished review that usually lands around 4–6 complete, grammatically correct sentences when the raw input contains enough detail.
- If the guest mentioned multiple aspects (for example room, cleanliness, staff, location, food, check-in, noise, amenities), preserve and cover as many of those mentioned aspects as possible instead of collapsing everything into a short summary.
- Do not pad with generic filler just to make it longer. Length must come from reorganizing and clearly expressing details that are already present in the raw input.
- If the raw input is very short but still expresses a clear opinion (for example "great place", "amazing hotel", "nice staff", "room was dirty"), expand it into at least one full natural-sounding sentence using only that stated opinion. Example transformations:
  - "great place" → "It was a great place to stay."
  - "amazing hotel" → "The hotel was amazing."
  - "nice staff" → "The staff were very nice."
- For these short inputs, do not fabricate reasons, amenities, or specifics behind the opinion. Only turn the fragment into a complete sentence.
- Write in first person ("I", "we") if the input is first person; otherwise use neutral third person.
- Maintain the guest's overall tone (positive, negative, mixed) exactly as expressed.
- Output plain text only — no markdown, no bullet points, no headings.
- Do not add a rating, score, or star count.

If the raw input is too short or ambiguous to form a coherent longer review, return the input lightly cleaned up into 1–3 sentences without adding anything new.`;

const SHORT_INPUT_SYSTEM_PROMPT = `You are an expert hotel-review editor specializing in extremely short guest inputs.

Your job is to turn a brief fragment into a fuller 2–3 sentence hotel review that still stays completely grounded in the original text.

ABSOLUTE RULES:
1. NEVER invent any specific reason, amenity, event, or detail that the guest did not mention.
2. You MAY expand the wording of the same explicit opinion into a natural review by restating the same sentiment in more complete language.
3. You MAY describe the stay only at a high, generic level if that level is directly implied by the original sentiment.
4. NEVER introduce made-up specifics such as staff, room size, breakfast, cleanliness, location, check-in, value, or facilities unless they were explicitly mentioned.
5. Output plain text only.

FORMAL EXPANSION METHOD FOR SHORT INPUTS:
- Step 1: Identify the explicit subject, if any. Prefer the exact subject the guest mentioned, such as hotel, room, staff, or stay.
- Step 2: Identify the explicit sentiment or condition, such as good, bad, amazing, dirty, nice, noisy, comfortable.
- Step 3: Rewrite the fragment as one complete natural sentence that preserves the same subject and same sentiment strength.
- Step 4: Add one more sentence that restates the impact of that same opinion in broad, non-specific review language.
- Step 5: If the input is strong and clear, add a short third sentence only if it still stays generic and does not introduce new facts.

RULES FOR THE ADDITIONAL SENTENCE(S):
- They must stay at the same level of generality as the original input.
- They may restate overall impression, satisfaction, or dissatisfaction.
- They must not explain why unless the reason was already present in the input.
- They must not introduce new nouns or hotel aspects that were not mentioned.

REQUIRED STYLE:
- Return 2–3 complete sentences whenever the input clearly expresses a sentiment.
- Make the result feel more like a real review, not just a copy with punctuation added.
- Keep the sentiment strength aligned with the original input.
- Use natural hotel-review wording, but stay generic when the input is generic.

If the input is too ambiguous even for this, return one clean sentence without inventing anything.`;

function getWordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function isShortPolishInput(text: string): boolean {
  const trimmed = text.trim();
  const wordCount = getWordCount(trimmed);
  const sentenceCount = trimmed
    .split(/[.!?]+/)
    .map(part => part.trim())
    .filter(Boolean).length;

  return wordCount <= 6 || (wordCount <= 10 && sentenceCount <= 1);
}

function sanitizePolishedText(text: string): string {
  const trimmed = text.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

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

    const trimmedText = rawText.trim();
    const isShortInput = isShortPolishInput(trimmedText);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3, // low temperature to discourage creative invention
      max_tokens: 400,
      messages: [
        { role: 'system', content: isShortInput ? SHORT_INPUT_SYSTEM_PROMPT : SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Raw guest notes:\n"""\n${trimmedText}\n"""\n\nPolished review:`,
        },
      ],
    });

    const polishedText = sanitizePolishedText(
      completion.choices[0]?.message?.content?.trim() ?? ''
    );

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
