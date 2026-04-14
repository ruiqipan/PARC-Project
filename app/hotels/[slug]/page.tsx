import { createServerClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import HotelDetailClient from './HotelDetailClient';
import { Hotel, Review, Room } from '@/types';
import { HOTEL_THUMBNAIL_FALLBACK } from '@/lib/seed-data';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getHotelData(slug: string) {
  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient();
  } catch {
    return null;
  }

  // Try by slug first, then by ID
  let { data: hotel, error } = await supabase
    .from('hotels')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !hotel) {
    ({ data: hotel, error } = await supabase
      .from('hotels')
      .select('*')
      .eq('id', slug)
      .single());
  }

  if (error || !hotel) return null;

  const [{ data: reviews }, { data: rooms }] = await Promise.all([
    supabase
      .from('reviews')
      .select('*')
      .eq('hotel_id', hotel.id)
      .order('acquisition_date', { ascending: false })
      .limit(20),
    supabase
      .from('rooms')
      .select('*')
      .eq('hotel_id', hotel.id)
      .order('created_at', { ascending: true }),
  ]);

  return {
    hotel: {
      ...hotel,
      thumbnail_url: hotel.thumbnail_url || HOTEL_THUMBNAIL_FALLBACK,
      amenities: hotel.amenities || [],
    } as Hotel,
    reviews: (reviews || []) as Review[],
    rooms: (rooms || []) as Room[],
  };
}

export default async function HotelDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getHotelData(slug);

  if (!data) return notFound();

  return (
    <HotelDetailClient
      hotel={data.hotel}
      reviews={data.reviews}
      rooms={data.rooms}
    />
  );
}
