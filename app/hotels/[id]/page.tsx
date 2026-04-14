import { createServerClient } from '@/lib/supabase';
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
        .order('acquisition_date', { ascending: false }),
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
  const data = await getHotelData(id);

  if (!data) return notFound();

  return <HotelDetailClient hotel={data.hotel} reviews={data.reviews} />;
}
