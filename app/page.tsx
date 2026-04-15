import { createServerClient } from '@/lib/supabase';
import HotelCard from '@/components/hotel/HotelCard';
import { Hotel } from '@/types';

async function getHotelsWithReviewCounts(): Promise<(Hotel & { reviewCount: number })[]> {
  try {
    const supabase = createServerClient();

    const { data: hotels, error } = await supabase
      .from('Description_PROC')
      .select('*')
      .order('guestrating_avg_expedia', { ascending: false });

    if (error || !hotels) {
      console.error('[page] Failed to fetch hotels:', error);
      return [];
    }

    // Fetch exact count per hotel in parallel (head:true fetches no rows, just the count)
    const countResults = await Promise.all(
      (hotels as Hotel[]).map(h =>
        supabase
          .from('Reviews_PROC')
          .select('*', { count: 'exact', head: true })
          .eq('eg_property_id', h.eg_property_id)
      )
    );

    return (hotels as Hotel[]).map((h, i) => ({
      ...h,
      reviewCount: countResults[i].count ?? 0,
    }));
  } catch (err) {
    console.error('[page] Error:', err);
    return [];
  }
}

export default async function HotelListPage() {
  const hotels = await getHotelsWithReviewCounts();

  const usHotels = hotels.filter(h => h.country === 'United States');
  const intlHotels = hotels.filter(h => h.country !== 'United States');

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Hero */}
      <div className="bg-[#003580]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
            Hotels &amp; Accommodations
          </h1>
          <p className="text-blue-200 text-sm sm:text-base">
            {hotels.length} properties · Sorted by guest rating
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {hotels.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg font-medium">No properties found.</p>
            <p className="text-sm mt-2 text-gray-400">
              Ensure Description_PROC and Reviews_PROC are imported in Supabase.
            </p>
          </div>
        ) : (
          <>
            {/* US properties first */}
            {usHotels.length > 0 && (
              <section className="mb-10">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  🇺🇸 <span>United States</span>
                  <span className="text-sm font-normal text-gray-400">({usHotels.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {usHotels.map(hotel => (
                    <HotelCard key={hotel.eg_property_id} hotel={hotel} />
                  ))}
                </div>
              </section>
            )}

            {/* International */}
            {intlHotels.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  🌍 <span>International</span>
                  <span className="text-sm font-normal text-gray-400">({intlHotels.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {intlHotels.map(hotel => (
                    <HotelCard key={hotel.eg_property_id} hotel={hotel} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
