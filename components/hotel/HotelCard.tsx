'use client';

import Link from 'next/link';
import { Hotel } from '@/types';
import { AMENITY_LABELS } from '@/lib/utils';

interface HotelCardProps {
  hotel: Hotel & { reviewCount: number };
}

function ratingLabel(r: number) {
  if (r >= 9) return 'Exceptional';
  if (r >= 8) return 'Excellent';
  if (r >= 7) return 'Very Good';
  if (r >= 6) return 'Good';
  return 'Fair';
}

export default function HotelCard({ hotel }: HotelCardProps) {
  const location = [hotel.city, hotel.province, hotel.country].filter(Boolean).join(', ');
  const starRating = hotel.star_rating ? parseFloat(String(hotel.star_rating)) : null;
  const rating = hotel.guestrating_avg_expedia;
  const amenities = (hotel.popular_amenities_list || []).slice(0, 5);

  return (
    <Link href={`/hotels/${hotel.eg_property_id}`}>
      <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border border-gray-100 hover:border-blue-200 group h-full flex flex-col">
        {/* Color band (no image available) */}
        <div className="h-32 bg-gradient-to-br from-slate-600 to-slate-800 flex items-end p-4">
          <div>
            {starRating != null && (
              <span className="text-yellow-300 text-sm">
                {'★'.repeat(Math.round(starRating))}
                {'☆'.repeat(5 - Math.round(starRating))}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col">
          {/* Location */}
          <h3 className="font-semibold text-gray-900 text-base leading-tight group-hover:text-blue-700 transition-colors">
            {location || 'Unknown location'}
          </h3>

          {/* Guest rating */}
          {rating != null && rating > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                {rating.toFixed(1)}
              </span>
              <span className="text-xs text-gray-500">{ratingLabel(rating)}</span>
              {hotel.reviewCount > 0 && (
                <span className="text-xs text-gray-400">· {hotel.reviewCount} reviews</span>
              )}
            </div>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {amenities.map(key => (
                <span key={key} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {AMENITY_LABELS[key] || key.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto pt-3">
            <span className="text-xs text-blue-600 font-medium group-hover:underline">
              View details →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
