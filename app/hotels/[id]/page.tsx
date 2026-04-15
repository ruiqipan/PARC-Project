import { createServerClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import HotelDetailClient from './HotelDetailClient';
import { Hotel, Review, UserPersona } from '@/types';
import { getSession } from '@/lib/session';
import { buildReviewsProcReviewKey } from '@/lib/review-enrichment';
import { deriveReviewerTags, matchPersonaTags } from '@/lib/persona-match';
import {
  computeHotelClaimSuppression,
  type StoredFollowUpAnswer,
} from '@/lib/hotel-claim-suppression';

interface PageProps {
  params: Promise<{ id: string }>;
}

function hasMeaningfulReviewContent(review: Review): boolean {
  return Boolean(review.review_title?.trim() || review.review_text?.trim());
}

function getReviewDisplayPriority(review: Review): number {
  const hasTitle = Boolean(review.review_title?.trim());
  const hasBody = Boolean(review.review_text?.trim());

  if (hasTitle && hasBody) {
    return 2;
  }

  if (hasTitle || hasBody) {
    return 1;
  }

  // Untitled and bodyless reviews should always sink to the bottom.
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

function getReviewerTags(review: Review): string[] {
  return review.reviewer_tags?.length
    ? review.reviewer_tags
    : deriveReviewerTags(review);
}

function getReviewSemanticSimilarityScore(review: Review, userTags: string[]): number {
  if (userTags.length === 0) {
    return 0;
  }

  const reviewerTags = getReviewerTags(review);

  if (reviewerTags.length === 0) {
    return 0;
  }

  return matchPersonaTags(userTags, reviewerTags, userTags.length).length;
}

function getReviewExactTagOverlap(review: Review, userTags: string[]): number {
  if (userTags.length === 0) {
    return 0;
  }

  const reviewerTags = getReviewerTags(review).map(normaliseTag);
  if (reviewerTags.length === 0) {
    return 0;
  }

  const reviewerTagSet = new Set(reviewerTags);
  return userTags.reduce((count, tag) => (
    reviewerTagSet.has(normaliseTag(tag)) ? count + 1 : count
  ), 0);
}

function sortReviews(reviews: Review[], userTags: string[]): Review[] {
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

async function getHotelData(id: string) {
  try {
    const supabase = createServerClient();

    const [
      { data: hotel, error: hotelError },
      { data: historicReviews },
      { data: submissions },
    ] = await Promise.all([
      supabase
        .from('Description_PROC')
        .select('*')
        .eq('eg_property_id', id)
        .single(),
      supabase
        .from('Reviews_PROC')
        .select('*')
        .eq('eg_property_id', id)
        .order('acquisition_date', { ascending: false })
        .limit(10000),
      supabase
        .from('Review_Submissions')
        .select('*')
        .eq('eg_property_id', id)
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (hotelError || !hotel) return null;

    const submissionList = (submissions ?? []) as Record<string, unknown>[];
    const historicReviewList = (historicReviews ?? []) as Record<string, unknown>[];
    const submissionIds = submissionList
      .map(submission => (typeof submission.id === 'string' ? submission.id : null))
      .filter((value): value is string => Boolean(value));

    let followUpAnswers: StoredFollowUpAnswer[] = [];
    if (submissionIds.length > 0) {
      const { data: answers } = await supabase
        .from('FollowUp_Answers')
        .select('review_id, feature_name, ui_type, quantitative_value, qualitative_note')
        .in('review_id', submissionIds);

      followUpAnswers = ((answers ?? []) as StoredFollowUpAnswer[]).filter(answer =>
        typeof answer.review_id === 'string' &&
        typeof answer.feature_name === 'string' &&
        (answer.ui_type === 'Slider' || answer.ui_type === 'Agreement' || answer.ui_type === 'QuickTag'),
      );
    }

    // Fetch persona tags for all submitters in one query
    const userIds = [...new Set(submissionList.map(s => s.user_id).filter(Boolean))] as string[];
    let personaMap: Record<string, string[]> = {};
    if (userIds.length > 0) {
      const supabase2 = createServerClient();
      const { data: personas } = await supabase2
        .from('User_Personas')
        .select('user_id, tags')
        .in('user_id', userIds);
      personaMap = Object.fromEntries(
        (personas ?? []).map((p: Record<string, unknown>) => [p.user_id as string, p.tags as string[]])
      );
    }

    // Map Review_Submissions to the Review shape so ReviewFeed can render them uniformly
    const mappedSubmissions: Review[] = submissionList.map(s => ({
      eg_property_id: id,
      acquisition_date: (s.created_at as string) ?? null,
      lob: 'user_submitted',
      rating: s.rating ? { overall: s.rating as number } : null,
      review_title: null,
      review_text: ((s.ai_polished_text ?? s.raw_text) as string) ?? null,
      source_type: 'review_submissions',
      review_key: (s.id as string) ?? undefined,
      reviewer_name: (s.username as string) ?? null,
      reviewer_tags: s.user_id ? (personaMap[s.user_id as string] ?? []) : [],
    }));

    const mappedHistoricReviews: Review[] = historicReviewList.map(row => {
      const review: Review = {
        eg_property_id: id,
        acquisition_date: (row.acquisition_date as string) ?? null,
        lob: (row.lob as string) ?? null,
        rating: (row.rating as Review['rating']) ?? null,
        review_title: (row.review_title as string) ?? null,
        review_text: (row.review_text as string) ?? null,
        source_type: 'reviews_proc',
      };

      return {
        ...review,
        review_key: buildReviewsProcReviewKey(review),
      };
    });

    const reviews: Review[] = [...mappedSubmissions, ...mappedHistoricReviews];

    const claimSuppression = computeHotelClaimSuppression(
      hotel as Hotel,
      reviews,
      followUpAnswers,
    );

    return { hotel: hotel as Hotel, reviews, claimSuppression };
  } catch {
    return null;
  }
}

export default async function HotelDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [data, session] = await Promise.all([getHotelData(id), getSession()]);

  if (!data) return notFound();

  let userTags: string[] = [];

  if (session) {
    const supabase = createServerClient();
    const { data: persona } = await supabase
      .from('User_Personas')
      .select('tags')
      .eq('user_id', session.userId)
      .maybeSingle();

    userTags = ((persona as UserPersona | null)?.tags ?? []);
  }

  const sortedReviews = sortReviews(data.reviews, userTags);

  return (
    <HotelDetailClient
      hotel={data.hotel}
      reviews={sortedReviews}
      claimSuppression={data.claimSuppression}
      userId={session?.userId}
      username={session?.username}
      userTags={userTags}
    />
  );
}
