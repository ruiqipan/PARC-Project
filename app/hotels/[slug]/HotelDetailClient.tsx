'use client';

import { useState } from 'react';
import { Hotel, Review, Room, TravelerPersona } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import RoomTypeList from '@/components/hotel/RoomTypeList';
import ReviewFeed from '@/components/hotel/ReviewFeed';
import ReviewAndQuestion from '@/components/question/ReviewAndQuestion';
import PersonaSelector from '@/components/persona/PersonaSelector';
import Link from 'next/link';

interface Props {
  hotel: Hotel;
  reviews: Review[];
  rooms: Room[];
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
  'air conditioning': '❄️',
  concierge: '🛎️',
};

function parseAmenities(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // If it's a comma/semicolon separated string
  return raw.split(/[,;|]+/).map(s => s.trim()).filter(Boolean);
}

export default function HotelDetailClient({ hotel, reviews, rooms }: Props) {
  const [persona, setPersona] = useState<TravelerPersona>('solo');
  const [activeTab, setActiveTab] = useState<'overview' | 'reviews' | 'write-review'>('overview');

  const amenities = hotel.amenities?.length
    ? hotel.amenities
    : parseAmenities(hotel.popular_amenities_list);

  const reviewCount = reviews.length;
  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
    : hotel.expedia_rating || 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-blue-600">Hotels</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-900">{hotel.name || `Property ${hotel.eg_property_id}`}</span>
      </div>

      {/* Hero image */}
      <div className="relative h-64 md:h-80 rounded-2xl overflow-hidden mb-6 bg-gray-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hotel.thumbnail_url}
          alt={hotel.name || 'Hotel'}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-5 text-white">
          <h1 className="text-2xl md:text-3xl font-bold">
            {hotel.name || `Property ${hotel.eg_property_id}`}
          </h1>
          <p className="text-white/80 text-sm mt-1">
            {[hotel.city, hotel.province, hotel.country].filter(Boolean).join(', ')}
          </p>
        </div>
      </div>

      {/* Quick stats + persona */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="bg-blue-600 text-white text-sm font-bold px-2.5 py-1 rounded">
            {avgRating > 0 ? avgRating.toFixed(1) : 'N/A'}
          </span>
          <span className="text-sm text-gray-600">
            {avgRating >= 4.5 ? 'Exceptional' : avgRating >= 4.0 ? 'Excellent' : avgRating >= 3.5 ? 'Very Good' : 'Good'}
            {reviewCount > 0 && ` · ${reviewCount} reviews`}
          </span>
        </div>
        {hotel.star_rating && (
          <Badge variant="outline" className="text-yellow-600 border-yellow-300">
            {'★'.repeat(hotel.star_rating)} {hotel.star_rating}-star
          </Badge>
        )}
        {hotel.price_per_night && (
          <span className="text-sm font-semibold text-gray-700">
            From ${Math.round(hotel.price_per_night / 100)}/night
          </span>
        )}
        <div className="ml-auto">
          <PersonaSelector current={persona} onChange={setPersona} />
        </div>
      </div>

      {/* Amenities strip */}
      {amenities.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {amenities.slice(0, 10).map(a => {
            const key = a.toLowerCase().replace(/\s+/g, '-');
            return (
              <span key={a} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full">
                {AMENITY_ICONS[key] || '✓'} {a}
              </span>
            );
          })}
        </div>
      )}

      <Separator className="mb-6" />

      {/* Room types */}
      {rooms.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Room Types</h2>
          <RoomTypeList rooms={rooms} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'reviews', label: `Reviews (${reviewCount})` },
          { key: 'write-review', label: '✍️ Write a Review' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {hotel.property_description && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">About this property</h3>
              <p className="text-gray-700 text-sm leading-relaxed">{hotel.property_description}</p>
            </div>
          )}

          {hotel.area_description && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">The neighborhood</h3>
              <p className="text-gray-700 text-sm leading-relaxed">{hotel.area_description}</p>
            </div>
          )}

          {/* Policies grid */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Hotel policies</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {hotel.check_in_start_time && (
                <PolicyCard icon="🔑" label="Check-in" value={`From ${hotel.check_in_start_time}`} />
              )}
              {hotel.check_out_time && (
                <PolicyCard icon="🚪" label="Check-out" value={`Until ${hotel.check_out_time}`} />
              )}
              {hotel.pet_policy && (
                <PolicyCard icon="🐾" label="Pets" value={hotel.pet_policy} />
              )}
              {hotel.children_and_extra_bed_policy && (
                <PolicyCard icon="👶" label="Children" value={hotel.children_and_extra_bed_policy} />
              )}
            </div>
          </div>

          {hotel.know_before_you_go && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">📌 Know before you go</h3>
              <p className="text-gray-700 text-sm leading-relaxed">{hotel.know_before_you_go}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reviews' && (
        <ReviewFeed reviews={reviews} />
      )}

      {activeTab === 'write-review' && (
        <ReviewAndQuestion
          hotelId={hotel.id}
          hotelName={hotel.name || `this property`}
          persona={persona}
        />
      )}
    </div>
  );
}

function PolicyCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 flex gap-3">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-sm text-gray-800 mt-0.5 line-clamp-2">{value}</p>
      </div>
    </div>
  );
}
