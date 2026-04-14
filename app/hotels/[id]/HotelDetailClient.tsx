'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Hotel, Review } from '@/types';
import { Separator } from '@/components/ui/separator';
import ReviewFeed from '@/components/hotel/ReviewFeed';
import {
  parseArrayField,
  parseHtmlItems,
  stripHtml,
  AMENITY_LABELS,
  AMENITY_CATEGORY_LABELS,
} from '@/lib/utils';

interface Props {
  hotel: Hotel;
  reviews: Review[];
}

const AMENITY_CATEGORY_KEYS = [
  'property_amenity_food_and_drink',
  'property_amenity_guest_services',
  'property_amenity_internet',
  'property_amenity_parking',
  'property_amenity_outdoor',
  'property_amenity_accessibility',
  'property_amenity_business_services',
  'property_amenity_conveniences',
  'property_amenity_family_friendly',
  'property_amenity_things_to_do',
  'property_amenity_activities_nearby',
  'property_amenity_spa',
  'property_amenity_langs_spoken',
  'property_amenity_more',
] as const;

function ratingLabel(r: number) {
  if (r >= 9) return 'Exceptional';
  if (r >= 8) return 'Excellent';
  if (r >= 7) return 'Very Good';
  if (r >= 6) return 'Good';
  return 'Fair';
}

export default function HotelDetailClient({ hotel, reviews }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'amenities' | 'policies' | 'reviews'>('overview');

  const location = [hotel.city, hotel.province, hotel.country].filter(Boolean).join(', ');
  const starRating = hotel.star_rating ? parseFloat(String(hotel.star_rating)) : null;
  const avgRating = hotel.guestrating_avg_expedia;
  const popularAmenities = hotel.popular_amenities_list || [];

  const checkOutPolicyItems = parseHtmlItems(hotel.check_out_policy);
  const petPolicyItems = parseHtmlItems(hotel.pet_policy);
  const childrenPolicyItems = parseHtmlItems(hotel.children_and_extra_bed_policy);
  const checkInInstructions = parseHtmlItems(hotel.check_in_instructions);
  const knowBeforeYouGo = parseHtmlItems(hotel.know_before_you_go);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'amenities', label: 'Amenities' },
    { key: 'policies', label: 'Policies' },
    { key: 'reviews', label: `Reviews (${reviews.length})` },
  ] as const;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-blue-600">Properties</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-900">{location || 'Property'}</span>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl p-8 mb-6 text-white">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">{location || 'Property'}</h1>
        <p className="text-slate-300 text-sm mb-4">ID: {hotel.eg_property_id}</p>

        <div className="flex flex-wrap items-center gap-3">
          {avgRating != null && avgRating > 0 && (
            <div className="flex items-center gap-2">
              <span className="bg-blue-500 text-white font-bold text-lg px-3 py-1 rounded-lg">
                {avgRating.toFixed(1)}
              </span>
              <span className="text-slate-200 text-sm">{ratingLabel(avgRating)} · {reviews.length} reviews</span>
            </div>
          )}
          {starRating != null && (
            <span className="bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 text-sm px-3 py-1 rounded-full">
              {'★'.repeat(Math.round(starRating))} {starRating}-star
            </span>
          )}
        </div>
      </div>

      {/* Popular amenities strip */}
      {popularAmenities.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {popularAmenities.map(key => (
            <span key={key} className="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full">
              {AMENITY_LABELS[key] || key.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      <Separator className="mb-6" />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {hotel.property_description && (
            <section>
              <h3 className="font-semibold text-gray-900 mb-2">About this property</h3>
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">
                {stripHtml(hotel.property_description)}
              </p>
            </section>
          )}
          {hotel.area_description && (
            <section>
              <h3 className="font-semibold text-gray-900 mb-2">The neighborhood</h3>
              <p className="text-gray-700 text-sm leading-relaxed">{stripHtml(hotel.area_description)}</p>
            </section>
          )}
        </div>
      )}

      {/* ── Amenities ── */}
      {activeTab === 'amenities' && (
        <div className="space-y-6">
          {AMENITY_CATEGORY_KEYS.map(key => {
            const items = parseArrayField((hotel as unknown as Record<string, unknown>)[key]);
            if (items.length === 0) return null;
            return (
              <section key={key}>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {AMENITY_CATEGORY_LABELS[key]}
                </h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-blue-500 mt-0.5 shrink-0">✓</span>
                      <span>{stripHtml(item)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* ── Policies ── */}
      {activeTab === 'policies' && (
        <div className="space-y-5">
          {/* Check-in / Check-out */}
          {(hotel.check_in_start_time || hotel.check_in_end_time || hotel.check_out_time) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(hotel.check_in_start_time || hotel.check_in_end_time) && (
                <PolicyCard
                  icon="🔑"
                  label="Check-in"
                  items={[
                    hotel.check_in_start_time ? `From ${hotel.check_in_start_time}` : null,
                    hotel.check_in_end_time ? `Until ${hotel.check_in_end_time}` : null,
                  ].filter(Boolean) as string[]}
                />
              )}
              {hotel.check_out_time && (
                <PolicyCard icon="🚪" label="Check-out" items={[`By ${hotel.check_out_time}`]} />
              )}
            </div>
          )}

          {checkOutPolicyItems.length > 0 && (
            <PolicyCard icon="📋" label="Check-out policy" items={checkOutPolicyItems} />
          )}
          {checkInInstructions.length > 0 && (
            <PolicyCard icon="ℹ️" label="Check-in instructions" items={checkInInstructions} />
          )}
          {petPolicyItems.length > 0 && (
            <PolicyCard icon="🐾" label="Pet policy" items={petPolicyItems} />
          )}
          {childrenPolicyItems.length > 0 && (
            <PolicyCard icon="👶" label="Children & extra beds" items={childrenPolicyItems} />
          )}
          {knowBeforeYouGo.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">📌 Know before you go</h3>
              <ul className="space-y-1">
                {knowBeforeYouGo.map((item, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="text-blue-400 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Reviews ── */}
      {activeTab === 'reviews' && <ReviewFeed reviews={reviews} />}
    </div>
  );
}

function PolicyCard({ icon, label, items }: { icon: string; label: string; items: string[] }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <p className="text-sm font-semibold text-gray-700">{label}</p>
      </div>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-gray-600">{item}</li>
        ))}
      </ul>
    </div>
  );
}
