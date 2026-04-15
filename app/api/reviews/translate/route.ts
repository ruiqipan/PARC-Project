import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TRANSLATION_PROMPT = `You are a careful hotel review translator.

Your tasks:
1. Detect whether the review text is primarily English.
2. If it is already primarily English, do not translate it.
3. If it is not primarily English, translate it accurately into the requested target language.

Rules:
- Preserve meaning, tone, and sentiment exactly.
- Do not add, remove, or embellish details.
- Keep the output natural in the target language.
- Return valid JSON only.

Use this exact JSON schema:
{
  "detectedLanguage": "<language name in English>",
  "isEnglish": true | false,
  "translatedText": "<translated text, or the original text if already English>"
}`;

interface TranslationResponse {
  detectedLanguage: string;
  isEnglish: boolean;
  translatedText: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reviewText = typeof body?.reviewText === 'string' ? body.reviewText.trim() : '';
    const targetLanguage = typeof body?.targetLanguage === 'string' ? body.targetLanguage.trim() : '';

    if (!reviewText) {
      return Response.json({ error: 'reviewText is required' }, { status: 400 });
    }

    if (!targetLanguage) {
      return Response.json({ error: 'targetLanguage is required' }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        { role: 'system', content: TRANSLATION_PROMPT },
        {
          role: 'user',
          content: `Target language: ${targetLanguage}

Review text:
"""
${reviewText}
"""`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return Response.json({ error: 'Translation service returned an empty response' }, { status: 502 });
    }

    const parsed = JSON.parse(content) as Partial<TranslationResponse>;
    const detectedLanguage = typeof parsed.detectedLanguage === 'string' ? parsed.detectedLanguage.trim() : 'Unknown';
    const isEnglish = Boolean(parsed.isEnglish);
    const translatedText = typeof parsed.translatedText === 'string' ? parsed.translatedText.trim() : '';

    if (!translatedText) {
      return Response.json({ error: 'Translation service returned invalid text' }, { status: 502 });
    }

    return Response.json({
      detectedLanguage,
      isEnglish,
      translatedText,
    });
  } catch (err: unknown) {
    console.error('[review-translate] error:', err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: message }, { status: 500 });
  }
}
