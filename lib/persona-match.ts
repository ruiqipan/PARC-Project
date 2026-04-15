/**
 * persona-match.ts
 *
 * Semantic clustering for the PARC "Review Similarity Indicator" (Feature 2).
 *
 * Two strategies are exported:
 *
 *  1. matchPersonaTags()          — synchronous, static cluster map.
 *                                   Zero latency, zero API cost, works client
 *                                   or server.  Covers every tag from the PRD
 *                                   and the standard Expedia LOB vocabulary.
 *
 *  2. matchPersonaTagsWithEmbeddings() — async, OpenAI text-embedding-3-small.
 *                                   SERVER-SIDE ONLY (uses OPENAI_API_KEY).
 *                                   Handles arbitrary / custom user tags that
 *                                   fall outside the static map.  Results can
 *                                   be cached per (userTags, reviewerTags) pair
 *                                   to avoid redundant API calls.
 *
 * Reviewer tags for historical Reviews_PROC rows (which have no author
 * persona) are derived by deriveReviewerTags(), which maps:
 *   • lob (line of business)           → travel-style tags
 *   • high-scoring rating dimensions   → interest/priority tags
 */

import type { Review, RatingBreakdown, PersonaMatch } from '@/types';

// ─── Cluster definitions ──────────────────────────────────────────────────────

interface ClusterInfo {
  /** Internal ID used for deduplication and badge copy selection. */
  cluster: string;
  /** Human-readable label shown in the UI badge. */
  label: string;
}

/**
 * All keys are lowercased and trimmed.
 * Add entries here to extend coverage — no code changes needed elsewhere.
 *
 * Clusters marked [identity] use "Similar preference:" copy.
 * All others use "Shares your focus:" copy.
 */
const TAG_CLUSTERS: Record<string, ClusterInfo> = {
  // ── Rest & Sensory ──────────────────────────────────────────────────────────
  quiet:               { cluster: 'rest', label: 'Rest & Sensory' },
  'light sleeper':     { cluster: 'rest', label: 'Rest & Sensory' },
  'sleep quality':     { cluster: 'rest', label: 'Rest & Sensory' },
  sleep:               { cluster: 'rest', label: 'Rest & Sensory' },
  peaceful:            { cluster: 'rest', label: 'Rest & Sensory' },
  noise:               { cluster: 'rest', label: 'Rest & Sensory' },
  soundproof:          { cluster: 'rest', label: 'Rest & Sensory' },
  relaxation:          { cluster: 'rest', label: 'Rest & Sensory' },
  'strong ac':         { cluster: 'rest', label: 'Rest & Sensory' },
  'air conditioning':  { cluster: 'rest', label: 'Rest & Sensory' },
  'air quality':       { cluster: 'rest', label: 'Rest & Sensory' },
  'room comfort':      { cluster: 'rest', label: 'Rest & Sensory' },
  roomcomfort:         { cluster: 'rest', label: 'Rest & Sensory' },
  'spacious room':     { cluster: 'rest', label: 'Rest & Sensory' },
  neurodivergent:      { cluster: 'sensory', label: 'Rest & Sensory' },
  'sensory-sensitive': { cluster: 'sensory', label: 'Rest & Sensory' },
  sensory:             { cluster: 'sensory', label: 'Rest & Sensory' },
  autism:              { cluster: 'sensory', label: 'Rest & Sensory' },
  adhd:                { cluster: 'sensory', label: 'Rest & Sensory' },
  'fragrance-sensitive': { cluster: 'sensory', label: 'Rest & Sensory' },
  'air quality sensitive': { cluster: 'sensory', label: 'Rest & Sensory' },

  // ── Business & Connectivity ────────────────────────────────────────────────
  'business traveler': { cluster: 'business', label: 'Business & Connectivity' },
  'business travel':   { cluster: 'business', label: 'Business & Connectivity' },
  business:            { cluster: 'business', label: 'Business & Connectivity' },
  'convention attendee': { cluster: 'business', label: 'Business & Connectivity' },
  conference:          { cluster: 'business', label: 'Business & Connectivity' },
  'digital nomad':     { cluster: 'business', label: 'Business & Connectivity' },
  'remote worker':     { cluster: 'business', label: 'Business & Connectivity' },
  'fast wifi':         { cluster: 'business', label: 'Business & Connectivity' },
  wifi:                { cluster: 'business', label: 'Business & Connectivity' },
  'free wifi':         { cluster: 'business', label: 'Business & Connectivity' },
  internet:            { cluster: 'business', label: 'Business & Connectivity' },
  'work desk':         { cluster: 'business', label: 'Business & Connectivity' },
  'business services': { cluster: 'business', label: 'Business & Connectivity' },
  'long-stay traveler': { cluster: 'business', label: 'Business & Connectivity' },

  // ── Accessibility [identity] ───────────────────────────────────────────────
  'wheelchair user':          { cluster: 'accessibility', label: 'Accessibility' },
  wheelchair:                 { cluster: 'accessibility', label: 'Accessibility' },
  accessible:                 { cluster: 'accessibility', label: 'Accessibility' },
  accessibility:              { cluster: 'accessibility', label: 'Accessibility' },
  'mobility aid user':        { cluster: 'accessibility', label: 'Accessibility' },
  mobility:                   { cluster: 'accessibility', label: 'Accessibility' },
  disability:                 { cluster: 'accessibility', label: 'Accessibility' },
  'visual impairment':        { cluster: 'accessibility', label: 'Accessibility' },
  'hearing impairment':       { cluster: 'accessibility', label: 'Accessibility' },
  'step-free access needed':  { cluster: 'accessibility', label: 'Accessibility' },
  'elevator access needed':   { cluster: 'accessibility', label: 'Accessibility' },
  elevator:                   { cluster: 'accessibility', label: 'Accessibility' },
  'accessible bathroom needed': { cluster: 'accessibility', label: 'Accessibility' },

  // ── Pets & Service Animals [identity] ──────────────────────────────────────
  'pet owner':       { cluster: 'pets', label: 'Pets & Service Animals' },
  'dog owner':       { cluster: 'pets', label: 'Pets & Service Animals' },
  'guide dog owner': { cluster: 'pets', label: 'Pets & Service Animals' },
  dog:               { cluster: 'pets', label: 'Pets & Service Animals' },
  cat:               { cluster: 'pets', label: 'Pets & Service Animals' },
  pets:              { cluster: 'pets', label: 'Pets & Service Animals' },
  'pet policy':      { cluster: 'pets', label: 'Pets & Service Animals' },
  'dog friendly':    { cluster: 'pets', label: 'Pets & Service Animals' },
  'pet friendly':    { cluster: 'pets', label: 'Pets & Service Animals' },

  // ── Family & Care [identity] ───────────────────────────────────────────────
  'family traveler':             { cluster: 'family', label: 'Family & Care' },
  family:                        { cluster: 'family', label: 'Family & Care' },
  kids:                          { cluster: 'family', label: 'Family & Care' },
  children:                      { cluster: 'family', label: 'Family & Care' },
  'family friendly':             { cluster: 'family', label: 'Family & Care' },
  parent:                        { cluster: 'family', label: 'Family & Care' },
  'group traveler':              { cluster: 'family', label: 'Family & Care' },
  'traveling with baby/toddler': { cluster: 'family', label: 'Family & Care' },
  'traveling with kids':         { cluster: 'family', label: 'Family & Care' },
  'traveling with teens':        { cluster: 'family', label: 'Family & Care' },
  'caregiver traveler':          { cluster: 'family', label: 'Family & Care' },
  'senior traveler':             { cluster: 'family', label: 'Family & Care' },

  // ── Value ──────────────────────────────────────────────────────────────────
  backpacker:         { cluster: 'value', label: 'Value' },
  'budget traveler':  { cluster: 'value', label: 'Value' },
  budget:             { cluster: 'value', label: 'Value' },
  value:              { cluster: 'value', label: 'Value' },
  'value for money':  { cluster: 'value', label: 'Value' },
  valueformoney:      { cluster: 'value', label: 'Value' },
  price:              { cluster: 'value', label: 'Value' },
  affordable:         { cluster: 'value', label: 'Value' },

  // ── Food & Dining ──────────────────────────────────────────────────────────
  foodie:                { cluster: 'food', label: 'Food & Dining' },
  food:                  { cluster: 'food', label: 'Food & Dining' },
  breakfast:             { cluster: 'food', label: 'Food & Dining' },
  'breakfast-first':     { cluster: 'food', label: 'Food & Dining' },
  restaurant:            { cluster: 'food', label: 'Food & Dining' },
  dining:                { cluster: 'food', label: 'Food & Dining' },
  'breakfast included':  { cluster: 'food', label: 'Food & Dining' },
  'breakfast available': { cluster: 'food', label: 'Food & Dining' },
  'dietary restrictions': { cluster: 'food', label: 'Food & Dining' },

  // ── Location & Mobility ────────────────────────────────────────────────────
  location:                  { cluster: 'location', label: 'Location & Mobility' },
  transit:                   { cluster: 'location', label: 'Location & Mobility' },
  subway:                    { cluster: 'location', label: 'Location & Mobility' },
  central:                   { cluster: 'location', label: 'Location & Mobility' },
  'convenience of location': { cluster: 'location', label: 'Location & Mobility' },
  convenienceoflocation:     { cluster: 'location', label: 'Location & Mobility' },
  neighborhood:              { cluster: 'location', label: 'Location & Mobility' },
  neighborhoodsatisfaction:  { cluster: 'location', label: 'Location & Mobility' },
  tourist:                   { cluster: 'leisure', label: 'Leisure & Exploration' },
  sightseeing:               { cluster: 'leisure', label: 'Leisure & Exploration' },
  vacation:                  { cluster: 'leisure', label: 'Leisure & Exploration' },
  leisure:                   { cluster: 'leisure', label: 'Leisure & Exploration' },
  'weekend getaway':         { cluster: 'leisure', label: 'Leisure & Exploration' },
  'event traveler':          { cluster: 'leisure', label: 'Leisure & Exploration' },
  'adventure traveler':      { cluster: 'leisure', label: 'Leisure & Exploration' },
  'culture enthusiast':      { cluster: 'leisure', label: 'Leisure & Exploration' },
  'road tripper':            { cluster: 'location', label: 'Location & Mobility' },
  'parking needed':          { cluster: 'location', label: 'Location & Mobility' },
  'transit-first':           { cluster: 'location', label: 'Location & Mobility' },
  'walkable area':           { cluster: 'location', label: 'Location & Mobility' },

  // ── Luxury & Wellness ──────────────────────────────────────────────────────
  'luxury traveler': { cluster: 'luxury', label: 'Luxury & Wellness' },
  luxury:            { cluster: 'luxury', label: 'Luxury & Wellness' },
  premium:           { cluster: 'luxury', label: 'Luxury & Wellness' },
  upscale:           { cluster: 'luxury', label: 'Luxury & Wellness' },
  'wellness traveler': { cluster: 'luxury', label: 'Luxury & Wellness' },
  'couple traveler': { cluster: 'luxury', label: 'Luxury & Wellness' },
  'pool access':     { cluster: 'luxury', label: 'Luxury & Wellness' },
  pool:              { cluster: 'luxury', label: 'Luxury & Wellness' },
  'gym access':      { cluster: 'luxury', label: 'Luxury & Wellness' },
  fitness:           { cluster: 'luxury', label: 'Luxury & Wellness' },
  gym:               { cluster: 'luxury', label: 'Luxury & Wellness' },
  'spa & relaxation': { cluster: 'luxury', label: 'Luxury & Wellness' },
  spa:               { cluster: 'luxury', label: 'Luxury & Wellness' },
  'hot tub':         { cluster: 'luxury', label: 'Luxury & Wellness' },
  wellness:          { cluster: 'luxury', label: 'Luxury & Wellness' },

  // ── Safety & Cleanliness ───────────────────────────────────────────────────
  cleanliness:         { cluster: 'clean', label: 'Safety & Cleanliness' },
  clean:               { cluster: 'clean', label: 'Safety & Cleanliness' },
  hygiene:             { cluster: 'clean', label: 'Safety & Cleanliness' },
  'room cleanliness':  { cluster: 'clean', label: 'Safety & Cleanliness' },
  roomcleanliness:     { cluster: 'clean', label: 'Safety & Cleanliness' },
  'safety-conscious':  { cluster: 'clean', label: 'Safety & Cleanliness' },
  'cleanliness-focused': { cluster: 'clean', label: 'Safety & Cleanliness' },
  'chronic illness':   { cluster: 'clean', label: 'Safety & Cleanliness' },

  // ── Eco-Conscious ──────────────────────────────────────────────────────────
  'eco-conscious':  { cluster: 'eco', label: 'Eco-Conscious' },
  'eco-friendly':   { cluster: 'eco', label: 'Eco-Conscious' },
  'eco friendly':   { cluster: 'eco', label: 'Eco-Conscious' },
  sustainable:      { cluster: 'eco', label: 'Eco-Conscious' },
  green:            { cluster: 'eco', label: 'Eco-Conscious' },
  ecofriendliness:  { cluster: 'eco', label: 'Eco-Conscious' },

  // ── Hospitality & Service ──────────────────────────────────────────────────
  service:       { cluster: 'service', label: 'Hospitality & Service' },
  staff:         { cluster: 'service', label: 'Hospitality & Service' },
  hospitality:   { cluster: 'service', label: 'Hospitality & Service' },
  'check-in':    { cluster: 'service', label: 'Hospitality & Service' },
  checkin:       { cluster: 'service', label: 'Hospitality & Service' },
  communication: { cluster: 'service', label: 'Hospitality & Service' },
};

/**
 * "Identity-based" clusters use "Similar preference:" copy.
 * All other clusters use "Shares your focus:" copy.
 */
const IDENTITY_CLUSTERS = new Set(['accessibility', 'pets', 'family', 'sensory']);

/** Returns the cluster for a raw tag string, or null if unrecognised. */
function getCluster(tag: string): ClusterInfo | null {
  return TAG_CLUSTERS[tag.toLowerCase().trim()] ?? null;
}

// ─── LOB → tags ───────────────────────────────────────────────────────────────

/**
 * Maps Expedia "line of business" values to a set of implied persona tags.
 * LOB strings in the data are things like "business", "leisure", "family", etc.
 */
const LOB_TAGS: Array<{ pattern: RegExp; tags: string[] }> = [
  { pattern: /business/i,            tags: ['Business traveler', 'WiFi', 'Business services'] },
  { pattern: /family/i,              tags: ['Family traveler', 'Family', 'Kids'] },
  { pattern: /couple|romance|romantic/i, tags: ['Quiet', 'Relaxation', 'Luxury'] },
  { pattern: /solo/i,                tags: ['Budget', 'Tourist'] },
  { pattern: /leisure/i,             tags: ['Tourist', 'Leisure', 'Vacation'] },
  { pattern: /group/i,               tags: ['Family', 'Tourist'] },
];

// ─── Rating dimensions → implied reviewer interests ───────────────────────────

/**
 * When a reviewer gives a notably high score (≥ 4 / 5) on a dimension, we
 * treat it as a signal that they care about that aspect.  Low scores (≤ 2)
 * also indicate strong opinion, included for completeness.
 */
const DIMENSION_TAGS: Array<{ key: keyof RatingBreakdown; tag: string }> = [
  { key: 'roomcleanliness',         tag: 'Cleanliness' },
  { key: 'service',                 tag: 'Service' },
  { key: 'location',                tag: 'Location' },
  { key: 'valueformoney',           tag: 'Value for money' },
  { key: 'roomcomfort',             tag: 'Quiet' },
  { key: 'ecofriendliness',         tag: 'Eco-friendly' },
  { key: 'checkin',                 tag: 'Check-in' },
  { key: 'communication',           tag: 'Communication' },
  { key: 'convenienceoflocation',   tag: 'Location' },
  { key: 'neighborhoodsatisfaction',tag: 'Neighborhood' },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Derives implied persona tags from a historical Reviews_PROC row.
 *
 * Sources:
 *   1. lob field   → travel-style tags (business, family, …)
 *   2. sub-ratings → interest/priority tags for dimensions scored ≥ 4
 */
export function deriveReviewerTags(review: Review): string[] {
  const tags = new Set<string>();

  // 1. LOB
  if (review.lob) {
    for (const { pattern, tags: lobTags } of LOB_TAGS) {
      if (pattern.test(review.lob)) {
        lobTags.forEach(t => tags.add(t));
        break;
      }
    }
  }

  // 2. High-scoring rating dimensions (strong positive opinions signal priority)
  if (review.rating) {
    for (const { key, tag } of DIMENSION_TAGS) {
      const score = review.rating[key];
      if (typeof score === 'number' && score >= 4) {
        tags.add(tag);
      }
    }
  }

  return [...tags];
}

/**
 * Synchronous, zero-latency semantic matching using the static cluster map.
 *
 * Returns up to `maxMatches` PersonaMatch objects (default 2, per PRD).
 * One match per cluster — so "Quiet" and "Relaxation" won't both fire under
 * "Rest & Quiet".
 *
 * @param userTags     Tags from the viewing user's UserPersona record.
 * @param reviewerTags Tags derived from deriveReviewerTags() or a stored persona.
 * @param maxMatches   Cap on results shown in the badge (PRD recommends 1-2).
 */
export function matchPersonaTags(
  userTags: string[],
  reviewerTags: string[],
  maxMatches = 2,
): PersonaMatch[] {
  const matches: PersonaMatch[] = [];
  const seenClusters = new Set<string>();

  for (const userTag of userTags) {
    if (matches.length >= maxMatches) break;

    const userCluster = getCluster(userTag);
    if (!userCluster) continue;
    if (seenClusters.has(userCluster.cluster)) continue;

    for (const reviewerTag of reviewerTags) {
      const reviewerCluster = getCluster(reviewerTag);
      if (!reviewerCluster) continue;
      if (reviewerCluster.cluster !== userCluster.cluster) continue;

      matches.push({
        userTag,
        reviewerTag,
        clusterLabel: userCluster.label,
        clusterId:    userCluster.cluster,
      });
      seenClusters.add(userCluster.cluster);
      break; // one match per cluster
    }
  }

  return matches;
}

/**
 * Returns the badge copy prefix for a given clusterId.
 *
 *  • Identity clusters → "Similar preference"
 *  • Focus/priority clusters → "Shares your focus"
 */
export function badgeCopyPrefix(clusterId: string): string {
  return IDENTITY_CLUSTERS.has(clusterId)
    ? 'Similar preference'
    : 'Shares your focus';
}

// ─── Embedding-based fallback (SERVER-SIDE ONLY) ──────────────────────────────

/**
 * Cosine similarity between two equal-length vectors.
 * Inlined to avoid adding a math dependency.
 */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma  += a[i] * a[i];
    mb  += b[i] * b[i];
  }
  const denom = Math.sqrt(ma) * Math.sqrt(mb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Embedding-based semantic matching for tags that fall outside the static map.
 *
 * SERVER-SIDE ONLY — reads process.env.OPENAI_API_KEY.
 *
 * Strategy:
 *   1. Run static matchPersonaTags() first (free).
 *   2. Collect unmatched user tags.
 *   3. Batch-embed all unmatched user tags + all reviewer tags in two calls.
 *   4. For each unmatched user tag, find the reviewer tag with the highest
 *      cosine similarity.  If similarity ≥ threshold, emit a match with the
 *      reviewer tag's cluster label (or a generic "Shared Interest" label).
 *
 * @param userTags      Tags from the viewing user's UserPersona.
 * @param reviewerTags  Tags derived from the reviewer's data.
 * @param threshold     Minimum cosine similarity to accept a match (default 0.72).
 * @param maxMatches    Total cap including static matches (default 2).
 */
export async function matchPersonaTagsWithEmbeddings(
  userTags: string[],
  reviewerTags: string[],
  threshold = 0.72,
  maxMatches = 2,
): Promise<PersonaMatch[]> {
  // 1. Static pass first
  const staticMatches = matchPersonaTags(userTags, reviewerTags, maxMatches);
  if (staticMatches.length >= maxMatches) return staticMatches;

  const matchedUserTags = new Set(staticMatches.map(m => m.userTag.toLowerCase()));
  const unmatchedUserTags = userTags.filter(
    t => !matchedUserTags.has(t.toLowerCase()),
  );
  if (unmatchedUserTags.length === 0 || reviewerTags.length === 0) {
    return staticMatches;
  }

  // 2. Lazy-import OpenAI so this module is safe to import in client bundles
  //    (the import will never be evaluated there).
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI(); // reads OPENAI_API_KEY from env

  // 3. Batch embed unmatched user tags and all reviewer tags
  const allTexts = [...unmatchedUserTags, ...reviewerTags];
  const embedResp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: allTexts,
  });

  const vectors = embedResp.data.map(d => d.embedding);
  const userVecs    = vectors.slice(0, unmatchedUserTags.length);
  const reviewerVecs= vectors.slice(unmatchedUserTags.length);

  // 4. Greedy nearest-neighbour matching
  const results: PersonaMatch[] = [...staticMatches];
  const seenClusters = new Set(staticMatches.map(m => m.clusterId));

  for (let ui = 0; ui < unmatchedUserTags.length; ui++) {
    if (results.length >= maxMatches) break;

    let bestSim = -1;
    let bestRi  = -1;

    for (let ri = 0; ri < reviewerTags.length; ri++) {
      const sim = cosineSim(userVecs[ui], reviewerVecs[ri]);
      if (sim > bestSim) { bestSim = sim; bestRi = ri; }
    }

    if (bestSim < threshold) continue;

    const userTag     = unmatchedUserTags[ui];
    const reviewerTag = reviewerTags[bestRi];

    // Try to find a cluster label from the static map for the reviewer tag
    const reviewerCluster = getCluster(reviewerTag) ?? getCluster(userTag);
    const clusterId    = reviewerCluster?.cluster ?? 'custom';
    const clusterLabel = reviewerCluster?.label   ?? 'Shared Interest';

    if (seenClusters.has(clusterId)) continue;
    seenClusters.add(clusterId);

    results.push({ userTag, reviewerTag, clusterLabel, clusterId });
  }

  return results;
}
