import { createServerClient } from '@/lib/supabase';
import HotelCard from '@/components/hotel/HotelCard';
import { Hotel } from '@/types';
import { HOTEL_THUMBNAIL_FALLBACK } from '@/lib/seed-data';

async function getHotels(): Promise<Hotel[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('hotels')
      .select('*')
      .order('expedia_rating', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[page] Failed to fetch hotels:', error);
      return [];
    }
    return (data || []) as Hotel[];
  } catch {
    return [];
  }
}

export default async function HotelListPage() {
  const hotels = await getHotels();

  return (
    <div>
      {/* Hero banner */}
      <div className="bg-[#003580] text-white py-10 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Find your perfect stay</h1>
          <p className="text-blue-200 text-sm">
            Powered by PARC — every listing is kept accurate by travelers like you.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {hotels.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg font-medium">No hotels found.</p>
            <p className="text-sm mt-2">
              Make sure your Supabase credentials are configured in{' '}
              <code className="bg-gray-100 px-1 rounded">.env.local</code> and the CSV data has been imported.
            </p>
            <p className="text-sm mt-1">
              Then run <code className="bg-gray-100 px-1 rounded">POST /api/seed</code> to initialize rooms and questions.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-800">
                {hotels.length} properties found
              </h2>
              <p className="text-sm text-gray-500">Sorted by guest rating</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {hotels.map(hotel => (
                <HotelCard
                  key={hotel.id}
                  hotel={{
                    ...hotel,
                    thumbnail_url: hotel.thumbnail_url || HOTEL_THUMBNAIL_FALLBACK,
                    amenities: hotel.amenities || [],
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
