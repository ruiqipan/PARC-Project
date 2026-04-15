import OpenAI from 'openai';
import { createServerClient } from '@/lib/supabase';
import { REVIEW_ENRICHMENT_BATCH_SIZE } from '@/lib/review-enrichment-constants';
import {
  ALLOWED_AI_REVIEW_TAGS,
  REVIEW_ENRICHMENT_MODEL,
  buildReviewSourceText,
  computeSourceTextHash,
  normalizeAllowedAiReviewTags,
} from '@/lib/review-enrichment';
import type { ReviewEnrichment, ReviewSourceType } from '@/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface EnrichmentRequestItem {
  reviewKey: string;
  sourceType: ReviewSourceType;
  egPropertyId: string;
  reviewTitle: string | null;
  reviewText: string | null;
  reviewerTags?: string[];
}

interface GeneratedEnrichmentItem {
  reviewKey: string;
  generatedTitle: string | null;
  generatedTags: string[];
}

interface ParsedGeneratedEnrichmentItem {
  reviewKey: string;
  generatedTitle: unknown;
  generatedTags: unknown;
}

function isEnrichmentRequestItem(item: unknown): item is EnrichmentRequestItem {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.reviewKey === 'string' &&
    typeof candidate.sourceType === 'string' &&
    typeof candidate.egPropertyId === 'string'
  );
}

function dedupeEnrichmentItems(items: EnrichmentRequestItem[]): EnrichmentRequestItem[] {
  const deduped = new Map<string, EnrichmentRequestItem>();

  for (const item of items) {
    deduped.set(item.reviewKey, item);
  }

  return [...deduped.values()];
}

const ENRICHMENT_PROMPT = `You generate cached display metadata for hotel reviews.

Return valid JSON only.

Rules:
1. Never invent facts beyond the review text.
2. Generate a concise English review title only when the original review has no title.
3. The title should usually be 3 to 8 words, headline style, grounded strictly in the review.
4. Generate at most 3 reviewer tags only when the review has no stored tags.
5. Tags must be chosen exactly from this allowed vocabulary:
${ALLOWED_AI_REVIEW_TAGS.join(', ')}
6. If a title or tags cannot be generated confidently, return null or an empty array.
7. Do not infer traveler type, amenities, or hotel qualities unless the review explicitly supports them.
8. Prefer fewer tags over weak tags. If evidence is thin, return an empty array.
9. Keep titles factual and restrained. Avoid hype, broad generalizations, or invented context.

Use this JSON schema:
{
  "items": [
    {
      "reviewKey": "string",
      "generatedTitle": "string | null",
      "generatedTags": ["tag1", "tag2"]
    }
  ]
}`;

function sanitizeGeneratedTitle(title: string | null): string | null {
  const trimmed = title?.trim() ?? '';
  if (!trimmed) {
    return null;
  }

  return trimmed.length > 120 ? trimmed.slice(0, 120).trim() : trimmed;
}

function parseGeneratedEnrichmentItem(item: unknown): ParsedGeneratedEnrichmentItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const candidate = item as Record<string, unknown>;
  const reviewKey =
    typeof candidate.reviewKey === 'string'
      ? candidate.reviewKey
      : typeof candidate.review_key === 'string'
        ? candidate.review_key
        : null;

  if (!reviewKey) {
    return null;
  }

  return {
    reviewKey,
    generatedTitle:
      candidate.generatedTitle ??
      candidate.title ??
      candidate.generated_title ??
      null,
    generatedTags:
      candidate.generatedTags ??
      candidate.tags ??
      candidate.generated_tags ??
      [],
  };
}

function buildBaseEnrichment(item: EnrichmentRequestItem): ReviewEnrichment {
  return {
    reviewKey: item.reviewKey,
    generatedTitle: null,
    generatedTags: [],
    titleWasAiGenerated: false,
    tagsWereAiGenerated: false,
    sourceTextHash: computeSourceTextHash(item.reviewTitle, item.reviewText),
  };
}

async function generateEnrichmentBatch(items: EnrichmentRequestItem[]): Promise<Map<string, GeneratedEnrichmentItem>> {
  const payload = items.map(item => ({
    reviewKey: item.reviewKey,
    needsTitle: !item.reviewTitle?.trim(),
    needsTags: !(item.reviewerTags?.length ?? 0),
    reviewText: buildReviewSourceText(item.reviewTitle, item.reviewText),
  }));

  const completion = await openai.chat.completions.create({
    model: REVIEW_ENRICHMENT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: ENRICHMENT_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({ items: payload }),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Review enrichment model returned empty content');
  }

  const parsed = JSON.parse(content) as { items?: unknown[] };
  const results = new Map<string, GeneratedEnrichmentItem>();

  for (const rawItem of parsed.items ?? []) {
    const item = parseGeneratedEnrichmentItem(rawItem);
    if (!item) {
      continue;
    }

    results.set(item.reviewKey, {
      reviewKey: item.reviewKey,
      generatedTitle: sanitizeGeneratedTitle(
        typeof item.generatedTitle === 'string' ? item.generatedTitle : null
      ),
      generatedTags: normalizeAllowedAiReviewTags(Array.isArray(item.generatedTags) ? item.generatedTags : []),
    });
  }

  return results;
}

async function generateEnrichmentBatchWithRetry(
  items: EnrichmentRequestItem[],
  depth = 0
): Promise<Map<string, GeneratedEnrichmentItem>> {
  if (items.length === 0) {
    return new Map();
  }

  try {
    return await generateEnrichmentBatch(items);
  } catch (error) {
    if (items.length === 1) {
      throw error;
    }

    const midpoint = Math.ceil(items.length / 2);
    const [left, right] = await Promise.all([
      generateEnrichmentBatchWithRetry(items.slice(0, midpoint), depth + 1),
      generateEnrichmentBatchWithRetry(items.slice(midpoint), depth + 1),
    ]);

    return new Map([...left, ...right]);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const incoming = Array.isArray(body?.reviews) ? body.reviews : [];
    const items = dedupeEnrichmentItems(
      incoming
        .filter(isEnrichmentRequestItem)
        .slice(0, REVIEW_ENRICHMENT_BATCH_SIZE)
        .map((item: EnrichmentRequestItem) => ({
          reviewKey: item.reviewKey,
          sourceType: item.sourceType,
          egPropertyId: item.egPropertyId,
          reviewTitle: typeof item.reviewTitle === 'string' ? item.reviewTitle : null,
          reviewText: typeof item.reviewText === 'string' ? item.reviewText : null,
          reviewerTags: Array.isArray(item.reviewerTags) ? item.reviewerTags.filter((tag): tag is string => typeof tag === 'string') : [],
        }))
    );

    if (items.length === 0) {
      return Response.json({ items: [] });
    }

    const supabase = createServerClient();
    const { data: cachedRows, error: cacheError } = await supabase
      .from('Review_Enrichments')
      .select('review_key, source_text_hash, generated_title, generated_tags, title_model, tags_model')
      .in('review_key', items.map((item: EnrichmentRequestItem) => item.reviewKey));

    if (cacheError) {
      throw new Error(cacheError.message);
    }

    const cachedByKey = new Map(
      (cachedRows ?? []).map((row: Record<string, unknown>) => [
        row.review_key as string,
        row,
      ])
    );

    const results = new Map<string, ReviewEnrichment>();
    const itemsToGenerate: EnrichmentRequestItem[] = [];
    const rowsToPersist: Array<Record<string, unknown>> = [];

    for (const item of items) {
      const base = buildBaseEnrichment(item);
      const needsTitle = !item.reviewTitle?.trim();
      const needsTags = !(item.reviewerTags?.length ?? 0);

      if (!needsTitle && !needsTags) {
        results.set(item.reviewKey, base);
        continue;
      }

      const cached = cachedByKey.get(item.reviewKey);
      const hasSourceText = Boolean(buildReviewSourceText(item.reviewTitle, item.reviewText));
      if (
        cached &&
        cached.source_text_hash === base.sourceTextHash
      ) {
        const cachedTitle = sanitizeGeneratedTitle((cached.generated_title as string | null) ?? null);
        const cachedTags = normalizeAllowedAiReviewTags(((cached.generated_tags as string[] | null) ?? []));
        const cachedHasAnyEnrichment = Boolean(cachedTitle) || cachedTags.length > 0;
        const cachedWasProcessed = Boolean(cached.title_model) || Boolean(cached.tags_model);

        if (cachedHasAnyEnrichment || cachedWasProcessed || !hasSourceText) {
          results.set(item.reviewKey, {
            ...base,
            generatedTitle: cachedTitle,
            generatedTags: cachedTags,
            titleWasAiGenerated: Boolean(cachedTitle) && needsTitle,
            tagsWereAiGenerated: cachedTags.length > 0 && needsTags,
          });
          continue;
        }
      }

      if (!hasSourceText) {
        results.set(item.reviewKey, base);
        rowsToPersist.push({
          source_type: item.sourceType,
          review_key: item.reviewKey,
          eg_property_id: item.egPropertyId,
          source_text_hash: base.sourceTextHash,
          generated_title: null,
          generated_tags: [],
          title_model: REVIEW_ENRICHMENT_MODEL,
          tags_model: REVIEW_ENRICHMENT_MODEL,
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      itemsToGenerate.push(item);
    }

    let generatedByKey = new Map<string, GeneratedEnrichmentItem>();
    if (itemsToGenerate.length > 0) {
      try {
        generatedByKey = await generateEnrichmentBatchWithRetry(itemsToGenerate);
      } catch (error) {
        console.error('[reviews/enrich] generation failed:', error);
      }
    }

    for (const item of itemsToGenerate) {
      const base = buildBaseEnrichment(item);
      const needsTitle = !item.reviewTitle?.trim();
      const needsTags = !(item.reviewerTags?.length ?? 0);
      const generated = generatedByKey.get(item.reviewKey);
      const generatedTitle = needsTitle ? sanitizeGeneratedTitle(generated?.generatedTitle ?? null) : null;
      const generatedTags = needsTags ? normalizeAllowedAiReviewTags(generated?.generatedTags ?? []) : [];

      results.set(item.reviewKey, {
        ...base,
        generatedTitle,
        generatedTags,
        titleWasAiGenerated: Boolean(generatedTitle),
        tagsWereAiGenerated: generatedTags.length > 0,
      });

      rowsToPersist.push({
        source_type: item.sourceType,
        review_key: item.reviewKey,
        eg_property_id: item.egPropertyId,
        source_text_hash: base.sourceTextHash,
        generated_title: generatedTitle,
        generated_tags: generatedTags,
        title_model: REVIEW_ENRICHMENT_MODEL,
        tags_model: REVIEW_ENRICHMENT_MODEL,
        updated_at: new Date().toISOString(),
      });
    }

    if (rowsToPersist.length > 0) {
      const { error: upsertError } = await supabase
        .from('Review_Enrichments')
        .upsert(rowsToPersist, { onConflict: 'review_key' });

      if (upsertError) {
        console.error('[reviews/enrich] failed to persist cache:', upsertError.message);
      }
    }

    return Response.json({
      items: items.map((item: EnrichmentRequestItem) => results.get(item.reviewKey) ?? buildBaseEnrichment(item)),
    });
  } catch (err: unknown) {
    console.error('[reviews/enrich] error:', err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: message }, { status: 500 });
  }
}
