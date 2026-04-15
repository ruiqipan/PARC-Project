import { createServerClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import HotelDetailClient from './HotelDetailClient';
import { Hotel, Review, UserPersona } from '@/types';
import { getSession } from '@/lib/session';
import {
  buildReviewsProcReviewKey,
  normalizeAllowedAiReviewTags,
} from '@/lib/review-enrichment';
import {
  computeHotelClaimSuppression,
  type StoredFollowUpAnswer,
} from '@/lib/hotel-claim-suppression';
import { sortReviewsByPersonaAlignment } from '@/lib/review-ranking';

interface PageProps {
  params: Promise<{ id: string }>;
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

    const { data: enrichmentRows } = await supabase
      .from('Review_Enrichments')
      .select('review_key, generated_title, generated_tags')
      .eq('eg_property_id', id);

    const enrichmentMap = new Map(
      ((enrichmentRows ?? []) as Record<string, unknown>[]).map(row => [
        row.review_key as string,
        {
          generated_title: typeof row.generated_title === 'string' ? row.generated_title : null,
          generated_tags: normalizeAllowedAiReviewTags(
            Array.isArray(row.generated_tags)
              ? row.generated_tags.filter((tag): tag is string => typeof tag === 'string')
              : [],
          ),
        },
      ]),
    );

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
      generated_title: null,
      generated_tags: [],
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

      const reviewKey = buildReviewsProcReviewKey(review);
      const enrichment = enrichmentMap.get(reviewKey);

      return {
        ...review,
        review_key: reviewKey,
        generated_title: enrichment?.generated_title ?? null,
        generated_tags: enrichment?.generated_tags ?? [],
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

  const sortedReviews = sortReviewsByPersonaAlignment(data.reviews, userTags);

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
