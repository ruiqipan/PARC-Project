import { createServerClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import HotelDetailClient from './HotelDetailClient';
import { Hotel, Review, UserPersona } from '@/types';
import { getSession } from '@/lib/session';

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getHotelData(id: string) {
  try {
    const supabase = createServerClient();

    const [{ data: hotel, error: hotelError }, { data: reviews }] = await Promise.all([
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
    ]);

    if (hotelError || !hotel) return null;

    return {
      hotel: hotel as Hotel,
      reviews: (reviews || []) as Review[],
    };
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

  return (
    <HotelDetailClient
      hotel={data.hotel}
      reviews={data.reviews}
      userId={session?.userId}
      userTags={userTags}
    />
  );
}
