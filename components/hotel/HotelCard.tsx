'use client';

import { Hotel } from '@/types';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface HotelCardProps {
  hotel: Hotel;
}

const AMENITY_ICONS: Record<string, string> = {
  wifi: '📶',
  pool: '🏊',
  gym: '💪',
  parking: '🅿️',
  breakfast: '🍳',
  spa: '🧖',
  restaurant: '🍽️',
  bar: '🍸',
  'pet-friendly': '🐾',
  accessible: '♿',
};

function StarRating({ count }: { count: number }) {
  return (
    <span className="text-yellow-400 text-sm">
      {'★'.repeat(Math.round(count))}{'☆'.repeat(5 - Math.round(count))}
    </span>
  );
}

export default function HotelCard({ hotel }: HotelCardProps) {
  const slug = hotel.slug || `hotel-${hotel.id}`;
  const rating = hotel.expedia_rating ?? 0;
  const amenities = (hotel.amenities || []).slice(0, 4);

  return (
    <Link href={`/hotels/${slug}`}>
      <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border border-gray-100 hover:border-blue-200 group">
        {/* Image */}
        <div className="relative h-48 overflow-hidden bg-gray-200">
          {hotel.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hotel.thumbnail_url}
              alt={hotel.name || 'Hotel'}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-5xl">🏨</div>
          )}
          {/* Star rating overlay */}
          {hotel.star_rating && (
            <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
              <StarRating count={hotel.star_rating} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 text-base leading-tight truncate group-hover:text-blue-700 transition-colors">
            {hotel.name || `Property ${hotel.eg_property_id}`}
          </h3>
          <p className="text-gray-500 text-sm mt-0.5">
            {[hotel.city, hotel.province, hotel.country].filter(Boolean).join(', ')}
          </p>

          {/* Rating */}
          {rating > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                {rating.toFixed(1)}
              </span>
              <span className="text-xs text-gray-500">
                {rating >= 4.5 ? 'Exceptional' : rating >= 4.0 ? 'Excellent' : rating >= 3.5 ? 'Very Good' : 'Good'}
              </span>
              {hotel.review_count && (
                <span className="text-xs text-gray-400">· {hotel.review_count} reviews</span>
              )}
            </div>
          )}

          {/* Amenity tags */}
          {amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {amenities.map(a => {
                const key = a.toLowerCase().replace(/\s+/g, '-');
                return (
                  <Badge key={a} variant="secondary" className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600">
                    {AMENITY_ICONS[key] || '•'} {a}
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Price */}
          <div className="mt-3 flex items-center justify-between">
            {hotel.price_per_night ? (
              <span className="text-sm font-semibold text-gray-900">
                ${Math.round(hotel.price_per_night / 100)}
                <span className="text-gray-500 font-normal text-xs"> /night</span>
              </span>
            ) : (
              <span />
            )}
            <span className="text-xs text-blue-600 font-medium group-hover:underline">
              View details →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
