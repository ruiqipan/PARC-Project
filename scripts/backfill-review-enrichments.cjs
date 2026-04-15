/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const OpenAI = require('openai').default;
const { createClient } = require('@supabase/supabase-js');

const REVIEW_ENRICHMENT_MODEL = 'gpt-5-nano';
const REVIEW_ENRICHMENT_BATCH_SIZE = 20;
const ALLOWED_AI_REVIEW_TAGS = [
  'Accessibility',
  'Adventure traveler',
  'Breakfast',
  'Budget',
  'Business services',
  'Business traveler',
  'Check-in',
  'Cleanliness',
  'Communication',
  'Couple traveler',
  'Dog friendly',
  'Eco-friendly',
  'Family',
  'Family traveler',
  'Fast WiFi',
  'Foodie',
  'Gym',
  'Kids',
  'Leisure',
  'Location',
  'Luxury',
  'Neighborhood',
  'Parking',
  'Pet owner',
  'Pool',
  'Quiet',
  'Relaxation',
  'Service',
  'Tourist',
  'Value for money',
  'Vacation',
  'WiFi',
];

const CANONICAL_TAG_LOOKUP = new Map(
  ALLOWED_AI_REVIEW_TAGS.map(tag => [tag.toLowerCase(), tag])
);

const AI_REVIEW_TAG_ALIASES = {
  accessibility: 'Accessibility',
  accessible: 'Accessibility',
  adventure: 'Adventure traveler',
  adventurer: 'Adventure traveler',
  breakfast: 'Breakfast',
  budget: 'Budget',
  affordable: 'Budget',
  business: 'Business traveler',
  work: 'Business traveler',
  coworking: 'Business services',
  workspace: 'Business services',
  desk: 'Business services',
  conference: 'Business services',
  checkin: 'Check-in',
  'check-in': 'Check-in',
  cleanliness: 'Cleanliness',
  clean: 'Cleanliness',
  communication: 'Communication',
  communicative: 'Communication',
  couple: 'Couple traveler',
  couples: 'Couple traveler',
  dog: 'Dog friendly',
  dogs: 'Dog friendly',
  eco: 'Eco-friendly',
  sustainable: 'Eco-friendly',
  family: 'Family',
  families: 'Family',
  kids: 'Kids',
  children: 'Kids',
  'family traveler': 'Family traveler',
  'fast wifi': 'Fast WiFi',
  wifi: 'WiFi',
  'wi-fi': 'WiFi',
  internet: 'WiFi',
  foodie: 'Foodie',
  dining: 'Foodie',
  restaurant: 'Foodie',
  restaurants: 'Foodie',
  food: 'Foodie',
  gym: 'Gym',
  fitness: 'Gym',
  leisure: 'Leisure',
  location: 'Location',
  luxury: 'Luxury',
  neighborhood: 'Neighborhood',
  neighbourhood: 'Neighborhood',
  parking: 'Parking',
  pet: 'Pet owner',
  pets: 'Pet owner',
  pool: 'Pool',
  quiet: 'Quiet',
  peaceful: 'Quiet',
  relaxation: 'Relaxation',
  relaxing: 'Relaxation',
  service: 'Service',
  staff: 'Service',
  tourist: 'Tourist',
  tourism: 'Tourist',
  value: 'Value for money',
  'value for money': 'Value for money',
  vacation: 'Vacation',
};

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

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  return Object.fromEntries(
    raw
      .split(/\n/)
      .filter(Boolean)
      .filter(line => !line.trim().startsWith('#'))
      .map(line => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx), line.slice(idx + 1)];
      })
  );
}

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildReviewSourceText(reviewTitle, reviewText) {
  const sanitize = value => {
    if (!value) {
      return '';
    }

    return value
      .normalize('NFKC')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .trim();
  };

  return [sanitize(reviewTitle), sanitize(reviewText)]
    .filter(Boolean)
    .join('\n\n');
}

function computeSourceTextHash(reviewTitle, reviewText) {
  return createHash('sha256')
    .update(buildReviewSourceText(reviewTitle, reviewText))
    .digest('hex');
}

function buildReviewsProcReviewKey(review) {
  const raw = [
    'reviews_proc',
    review.eg_property_id ?? '',
    review.acquisition_date ?? '',
    review.lob ?? '',
    review.review_title ?? '',
    review.review_text ?? '',
  ].join('|');

  return createHash('sha256').update(raw).digest('hex');
}

function sanitizeGeneratedTitle(title) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (!trimmed) {
    return null;
  }

  return trimmed.length > 120 ? trimmed.slice(0, 120).trim() : trimmed;
}

function normalizeAiReviewTag(tag) {
  const trimmed = typeof tag === 'string' ? tag.trim() : '';
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const directMatch = CANONICAL_TAG_LOOKUP.get(lower) ?? AI_REVIEW_TAG_ALIASES[lower];
  if (directMatch) {
    return directMatch;
  }

  if (lower.includes('wifi') || lower.includes('wi-fi')) {
    return lower.includes('fast') ? 'Fast WiFi' : 'WiFi';
  }

  if (lower.includes('business')) {
    return 'Business traveler';
  }

  if (lower.includes('restaurant') || lower.includes('dining') || lower.includes('food')) {
    return 'Foodie';
  }

  if (lower.includes('quiet') || lower.includes('peace')) {
    return 'Quiet';
  }

  if (lower.includes('location') || lower.includes('walkable')) {
    return 'Location';
  }

  if (lower.includes('clean')) {
    return 'Cleanliness';
  }

  if (lower.includes('staff') || lower.includes('service')) {
    return 'Service';
  }

  if (lower.includes('pool')) {
    return 'Pool';
  }

  if (lower.includes('gym') || lower.includes('fitness')) {
    return 'Gym';
  }

  if (lower.includes('family') || lower.includes('kid') || lower.includes('child')) {
    return 'Family traveler';
  }

  return null;
}

function normalizeAllowedAiReviewTags(tags) {
  const seen = new Set();
  const result = [];

  for (const tag of Array.isArray(tags) ? tags : []) {
    const normalized = normalizeAiReviewTag(tag);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);

    if (result.length >= 3) {
      break;
    }
  }

  return result;
}

function parseGeneratedEnrichmentItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const reviewKey =
    typeof item.reviewKey === 'string'
      ? item.reviewKey
      : typeof item.review_key === 'string'
        ? item.review_key
        : null;

  if (!reviewKey) {
    return null;
  }

  return {
    reviewKey,
    generatedTitle: item.generatedTitle ?? item.title ?? item.generated_title ?? null,
    generatedTags: item.generatedTags ?? item.tags ?? item.generated_tags ?? [],
  };
}

function dedupeByReviewKey(items) {
  const deduped = new Map();

  for (const item of items) {
    deduped.set(item.reviewKey, item);
  }

  return [...deduped.values()];
}

async function generateEnrichmentBatch(openai, items) {
  const payload = items.map(item => ({
    reviewKey: item.reviewKey,
    needsTitle: !item.reviewTitle?.trim(),
    needsTags: true,
    reviewText: buildReviewSourceText(item.reviewTitle, item.reviewText),
  }));

  const completion = await openai.chat.completions.create({
    model: REVIEW_ENRICHMENT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: ENRICHMENT_PROMPT },
      { role: 'user', content: JSON.stringify({ items: payload }) },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Review enrichment model returned empty content');
  }

  const parsed = JSON.parse(content);
  const results = new Map();

  for (const rawItem of parsed.items ?? []) {
    const item = parseGeneratedEnrichmentItem(rawItem);
    if (!item) {
      continue;
    }

    results.set(item.reviewKey, {
      generatedTitle: sanitizeGeneratedTitle(item.generatedTitle),
      generatedTags: normalizeAllowedAiReviewTags(item.generatedTags),
    });
  }

  return results;
}

async function generateEnrichmentBatchWithRetry(openai, items, worker, depth = 0) {
  if (items.length === 0) {
    return new Map();
  }

  try {
    return await generateEnrichmentBatch(openai, items);
  } catch (error) {
    if (items.length === 1) {
      console.error(
        `[${worker}] skipping review ${items[0].reviewKey} after OpenAI error at depth ${depth}:`,
        error
      );
      return new Map();
    }

    console.warn(
      `[${worker}] retrying batch split after OpenAI error at depth ${depth} for ${items.length} reviews`
    );

    const midpoint = Math.ceil(items.length / 2);
    const left = await generateEnrichmentBatchWithRetry(openai, items.slice(0, midpoint), worker, depth + 1);
    const right = await generateEnrichmentBatchWithRetry(openai, items.slice(midpoint), worker, depth + 1);
    return new Map([...left, ...right]);
  }
}

async function fetchCachedRowsByKey(supabase, reviewKeys) {
  if (reviewKeys.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('Review_Enrichments')
    .select('review_key, source_text_hash, generated_title, generated_tags, title_model, tags_model')
    .in('review_key', reviewKeys);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map(row => [row.review_key, row]));
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const offset = toInt(getArg('offset'), 0);
  const limit = toInt(getArg('limit'), 500);
  const worker = getArg('worker', 'worker');

  const { data: reviews, error } = await supabase
    .from('Reviews_PROC')
    .select('eg_property_id, acquisition_date, lob, review_title, review_text')
    .order('eg_property_id', { ascending: true })
    .order('acquisition_date', { ascending: true })
    .order('lob', { ascending: true })
    .order('review_title', { ascending: true, nullsFirst: true })
    .order('review_text', { ascending: true, nullsFirst: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw error;
  }

  const sourceRows = reviews ?? [];
  const reviewItems = dedupeByReviewKey(
    sourceRows
      .map(row => ({
        sourceType: 'reviews_proc',
        egPropertyId: row.eg_property_id,
        reviewTitle: typeof row.review_title === 'string' ? row.review_title : null,
        reviewText: typeof row.review_text === 'string' ? row.review_text : null,
        reviewKey: buildReviewsProcReviewKey(row),
      }))
      .filter(item => buildReviewSourceText(item.reviewTitle, item.reviewText))
  );

  console.log(
    `[${worker}] loaded ${sourceRows.length} rows, ${reviewItems.length} non-empty reviews`
  );

  let processed = 0;
  let persisted = 0;
  let generated = 0;

  for (let i = 0; i < reviewItems.length; i += REVIEW_ENRICHMENT_BATCH_SIZE) {
    const batch = reviewItems.slice(i, i + REVIEW_ENRICHMENT_BATCH_SIZE);
    const cachedByKey = await fetchCachedRowsByKey(
      supabase,
      batch.map(item => item.reviewKey)
    );
    const batchToGenerate = batch.filter(item => {
      const cached = cachedByKey.get(item.reviewKey);
      if (!cached) {
        return true;
      }

      const sourceTextHash = computeSourceTextHash(item.reviewTitle, item.reviewText);
      const cachedTitle = sanitizeGeneratedTitle(cached.generated_title ?? null);
      const cachedTags = normalizeAllowedAiReviewTags(cached.generated_tags ?? []);
      const cachedHasAnyEnrichment = Boolean(cachedTitle) || cachedTags.length > 0;
      const cachedWasProcessed = Boolean(cached.title_model) || Boolean(cached.tags_model);

      return cached.source_text_hash !== sourceTextHash || (!cachedHasAnyEnrichment && !cachedWasProcessed);
    });

    if (batchToGenerate.length === 0) {
      processed += batch.length;
      console.log(`[${worker}] processed ${processed}/${reviewItems.length}, persisted ${persisted}`);
      continue;
    }

    const generatedByKey = await generateEnrichmentBatchWithRetry(openai, batchToGenerate, worker);
    const rowsToPersist = [];

    for (const item of batchToGenerate) {
      const generated = generatedByKey.get(item.reviewKey);
      const generatedTitle = sanitizeGeneratedTitle(generated?.generatedTitle ?? null);
      const generatedTags = normalizeAllowedAiReviewTags(generated?.generatedTags ?? []);

      rowsToPersist.push({
        source_type: item.sourceType,
        review_key: item.reviewKey,
        eg_property_id: item.egPropertyId,
        source_text_hash: computeSourceTextHash(item.reviewTitle, item.reviewText),
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
        throw upsertError;
      }

      persisted += rowsToPersist.length;
    }

    processed += batch.length;
    generated += batchToGenerate.length;
    console.log(`[${worker}] processed ${processed}/${reviewItems.length}, generated ${generated}, persisted ${persisted}`);
  }

  console.log(
    JSON.stringify({
      worker,
      offset,
      limit,
      loaded: sourceRows.length,
      nonEmpty: reviewItems.length,
      generated,
      persisted,
    })
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
