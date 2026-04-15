import type { Review } from '@/types';
import { deriveReviewerTags, matchPersonaTags } from '@/lib/persona-match';

function hasMeaningfulReviewContent(review: Review): boolean {
  return Boolean(review.review_title?.trim() || review.generated_title?.trim() || review.review_text?.trim());
}

function getReviewDisplayPriority(review: Review): number {
  const hasTitle = Boolean(review.review_title?.trim() || review.generated_title?.trim());
  const hasBody = Boolean(review.review_text?.trim());

  if (hasTitle && hasBody) {
    return 2;
  }

  if (hasTitle || hasBody) {
    return 1;
  }

  return 0;
}

function getReviewTimestamp(review: Review): number {
  if (!review.acquisition_date) {
    return 0;
  }

  const time = new Date(review.acquisition_date).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getReviewSourcePriority(review: Review): number {
  return review.source_type === 'review_submissions' ? 1 : 0;
}

function normaliseTag(tag: string): string {
  return tag.trim().toLowerCase();
}

export function getReviewerTagsForRanking(review: Review): string[] {
  if (review.reviewer_tags?.length) {
    return review.reviewer_tags;
  }

  if (review.generated_tags?.length) {
    return review.generated_tags;
  }

  return deriveReviewerTags(review);
}

function getReviewSemanticSimilarityScore(review: Review, userTags: string[]): number {
  if (userTags.length === 0) {
    return 0;
  }

  const reviewerTags = getReviewerTagsForRanking(review);
  if (reviewerTags.length === 0) {
    return 0;
  }

  return matchPersonaTags(userTags, reviewerTags, userTags.length).length;
}

function getReviewExactTagOverlap(review: Review, userTags: string[]): number {
  if (userTags.length === 0) {
    return 0;
  }

  const reviewerTags = getReviewerTagsForRanking(review).map(normaliseTag);
  if (reviewerTags.length === 0) {
    return 0;
  }

  const reviewerTagSet = new Set(reviewerTags);
  return userTags.reduce((count, tag) => (
    reviewerTagSet.has(normaliseTag(tag)) ? count + 1 : count
  ), 0);
}

export function sortReviewsByPersonaAlignment(reviews: Review[], userTags: string[]): Review[] {
  const reviewSignals = new Map(
    reviews.map(review => [
      review,
      {
        hasContent: hasMeaningfulReviewContent(review),
        displayPriority: getReviewDisplayPriority(review),
        exactOverlap: getReviewExactTagOverlap(review, userTags),
        semanticSimilarity: getReviewSemanticSimilarityScore(review, userTags),
        sourcePriority: getReviewSourcePriority(review),
        timestamp: getReviewTimestamp(review),
      },
    ]),
  );

  return [...reviews].sort((a, b) => {
    const aSignals = reviewSignals.get(a);
    const bSignals = reviewSignals.get(b);
    if (!aSignals || !bSignals) {
      return 0;
    }

    if (aSignals.hasContent !== bSignals.hasContent) {
      return aSignals.hasContent ? -1 : 1;
    }

    const aHasPersonaMatch = aSignals.exactOverlap > 0 || aSignals.semanticSimilarity > 0;
    const bHasPersonaMatch = bSignals.exactOverlap > 0 || bSignals.semanticSimilarity > 0;
    if (aHasPersonaMatch !== bHasPersonaMatch) {
      return aHasPersonaMatch ? -1 : 1;
    }

    const exactOverlapDelta = bSignals.exactOverlap - aSignals.exactOverlap;
    if (exactOverlapDelta !== 0) {
      return exactOverlapDelta;
    }

    const similarityDelta = bSignals.semanticSimilarity - aSignals.semanticSimilarity;
    if (similarityDelta !== 0) {
      return similarityDelta;
    }

    const priorityDelta = bSignals.displayPriority - aSignals.displayPriority;
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const sourcePriorityDelta = bSignals.sourcePriority - aSignals.sourcePriority;
    if (sourcePriorityDelta !== 0) {
      return sourcePriorityDelta;
    }

    return bSignals.timestamp - aSignals.timestamp;
  });
}
