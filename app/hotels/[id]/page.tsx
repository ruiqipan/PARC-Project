import { createServerClient } from '@/lib/supabase';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import HotelDetailClient from './HotelDetailClient';
import { Hotel, Review } from '@/types';

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

async function getCurrentUserTags(supabase: ReturnType<typeof createServerClient>): Promise<string[]> {
  try {
    const store = await cookies();
    const userId = store.get('parc_anon_uid')?.value;
    if (!userId) return [];

    const { data } = await supabase
      .from('User_Personas')
      .select('tags')
      .eq('user_id', userId)
      .maybeSingle();

    return (data?.tags as string[]) ?? [];
  } catch {
    return [];
  }
}

export default async function HotelDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServerClient();

  const [data, userTags] = await Promise.all([
    getHotelData(id),
    getCurrentUserTags(supabase),
  ]);

  if (!data) return notFound();

  return <HotelDetailClient hotel={data.hotel} reviews={data.reviews} userTags={userTags} />;
}
