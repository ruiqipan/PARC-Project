'use client';

import Link from 'next/link';
import { Hotel } from '@/types';
import { AMENITY_LABELS } from '@/lib/utils';

interface HotelCardProps {
  hotel: Hotel & { reviewCount: number };
}

function ratingColor(r: number) {
  if (r >= 9) return 'bg-green-600';
  if (r >= 8) return 'bg-green-500';
  if (r >= 7) return 'bg-yellow-500';
  return 'bg-orange-500';
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
  const cityLine = hotel.city || 'Unknown City';
  const regionLine = [hotel.province, hotel.country].filter(Boolean).join(', ');
  const starRating = hotel.star_rating ? parseFloat(String(hotel.star_rating)) : null;
  const rating = hotel.guestrating_avg_expedia;
  const amenities = (hotel.popular_amenities_list || []).slice(0, 4);

  return (
    <Link href={`/hotels/${hotel.eg_property_id}`} className="group block h-full">
      <article className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 h-full flex flex-col overflow-hidden">

        {/* Color header — substitute for missing image */}
        <div className="h-28 sm:h-32 bg-gradient-to-br from-[#003580] to-[#0071c2] relative flex items-end p-4">
          <div className="text-white">
            <p className="font-bold text-lg sm:text-xl leading-tight drop-shadow">{cityLine}</p>
            {regionLine && (
              <p className="text-blue-200 text-xs mt-0.5">{regionLine}</p>
            )}
          </div>
          {starRating != null && (
            <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5">
              <span className="text-yellow-300 text-xs tracking-wide">
                {'★'.repeat(Math.round(starRating))}
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 flex-1 flex flex-col gap-3">
          {/* Rating row */}
          {rating != null && rating > 0 && (
            <div className="flex items-center gap-2">
              <span className={`${ratingColor(rating)} text-white text-sm font-bold px-2 py-0.5 rounded-md min-w-[42px] text-center`}>
                {rating.toFixed(1)}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800 leading-tight">{ratingLabel(rating)}</p>
                {hotel.reviewCount > 0 && (
                  <p className="text-xs text-gray-400">{hotel.reviewCount.toLocaleString()} reviews</p>
                )}
              </div>
            </div>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {amenities.map(key => (
                <span key={key} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {AMENITY_LABELS[key] || key.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="mt-auto pt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400 truncate max-w-[160px]" title={location}>
              {location}
            </span>
            <span className="text-xs font-semibold text-[#0071c2] group-hover:underline whitespace-nowrap">
              View details →
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
