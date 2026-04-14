import { createServerClient } from '@/lib/supabase';
import HotelCard from '@/components/hotel/HotelCard';
import { Hotel } from '@/types';

async function getHotelsWithReviewCounts(): Promise<(Hotel & { reviewCount: number })[]> {
  try {
    const supabase = createServerClient();

    const [{ data: hotels, error }, { data: reviewRows }] = await Promise.all([
      supabase.from('Description_PROC').select('*').order('guestrating_avg_expedia', { ascending: false }),
      supabase.from('Reviews_PROC').select('eg_property_id'),
    ]);

    if (error || !hotels) {
      console.error('[page] Failed to fetch hotels:', error);
      return [];
    }

    // Count reviews per property client-side
    const counts: Record<string, number> = {};
    (reviewRows || []).forEach(r => {
      counts[r.eg_property_id] = (counts[r.eg_property_id] || 0) + 1;
    });

    return (hotels as Hotel[]).map(h => ({
      ...h,
      reviewCount: counts[h.eg_property_id] || 0,
    }));
  } catch (err) {
    console.error('[page] Error:', err);
    return [];
  }
}

export default async function HotelListPage() {
  const hotels = await getHotelsWithReviewCounts();

  return (
    <div>
      <div className="bg-[#003580] text-white py-10 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Find your perfect stay</h1>
          <p className="text-blue-200 text-sm">
            {hotels.length} properties available · sorted by guest rating
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {hotels.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg font-medium">No properties found.</p>
            <p className="text-sm mt-2">Check that Description_PROC and Reviews_PROC are imported in Supabase.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {hotels.map(hotel => (
              <HotelCard key={hotel.eg_property_id} hotel={hotel} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
