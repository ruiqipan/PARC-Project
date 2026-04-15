'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Hotel, Review } from '@/types';
import ReviewFeed from '@/components/hotel/ReviewFeed';
import ReviewInput from '@/components/hotel/ReviewInput';
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
  userId?: string;
  username?: string;
  userTags?: string[];
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

function ratingColor(r: number) {
  if (r >= 9) return 'bg-green-600';
  if (r >= 8) return 'bg-green-500';
  if (r >= 7) return 'bg-yellow-500';
  return 'bg-orange-500';
}

type Tab = 'overview' | 'amenities' | 'policies' | 'reviews';

export default function HotelDetailClient({
  hotel,
  reviews,
  userId,
  username,
  userTags = [],
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const city = hotel.city || '';
  const regionLine = [hotel.province, hotel.country].filter(Boolean).join(', ');
  const starRating = hotel.star_rating ? parseFloat(String(hotel.star_rating)) : null;
  const rating = hotel.guestrating_avg_expedia;
  const popularAmenities = hotel.popular_amenities_list || [];

  const checkOutPolicyItems = parseHtmlItems(hotel.check_out_policy);
  const petPolicyItems = parseHtmlItems(hotel.pet_policy);
  const childrenPolicyItems = parseHtmlItems(hotel.children_and_extra_bed_policy);
  const checkInInstructions = parseHtmlItems(hotel.check_in_instructions);
  const knowBeforeYouGo = parseHtmlItems(hotel.know_before_you_go);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'amenities', label: 'Amenities' },
    { key: 'policies', label: 'Policies' },
    { key: 'reviews', label: `Reviews (${reviews.length.toLocaleString()})` },
  ];

  return (
    <div className="bg-gray-50 min-h-screen">

      {/* Hero header */}
      <div className="bg-gradient-to-br from-[#003580] to-[#0071c2] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {/* Breadcrumb */}
          <nav className="text-blue-300 text-xs sm:text-sm mb-4 flex items-center gap-1.5">
            <Link href="/" className="hover:text-white transition-colors">Hotels</Link>
            <span>›</span>
            <span className="text-white">{city || 'Property'}</span>
          </nav>

          <h1 className="text-2xl sm:text-3xl font-bold mb-1">{city || 'Property'}</h1>
          {regionLine && <p className="text-blue-200 text-sm mb-5">{regionLine}</p>}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {rating != null && rating > 0 && (
              <div className="flex items-center gap-2.5 bg-white/10 rounded-xl px-3 py-2">
                <span className={`${ratingColor(rating)} text-white font-bold text-base px-2.5 py-0.5 rounded-lg`}>
                  {rating.toFixed(1)}
                </span>
                <div>
                  <p className="font-semibold text-sm leading-tight">{ratingLabel(rating)}</p>
                  <p className="text-blue-200 text-xs">{reviews.length.toLocaleString()} reviews</p>
                </div>
              </div>
            )}
            {starRating != null && (
              <div className="bg-white/10 rounded-xl px-3 py-2">
                <p className="text-yellow-300 text-base leading-tight tracking-wide">
                  {'★'.repeat(Math.round(starRating))}
                  {'☆'.repeat(5 - Math.round(starRating))}
                </p>
                <p className="text-blue-200 text-xs">{starRating}-star hotel</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Popular amenities bar */}
      {popularAmenities.length > 0 && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap gap-2">
            {popularAmenities.map(key => (
              <span key={key} className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                {AMENITY_LABELS[key] || key.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0 overflow-x-auto scrollbar-none -mb-px">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 sm:px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-[#0071c2] text-[#0071c2]'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7 sm:py-9">

        {/* ── Overview ── */}
        {activeTab === 'overview' && (
          <div className="space-y-8 max-w-3xl">
            {hotel.property_description && (
              <section>
                <h2 className="text-base font-semibold text-gray-900 mb-3">About this property</h2>
                <p className="text-gray-700 text-sm leading-7 whitespace-pre-line">
                  {stripHtml(hotel.property_description)}
                </p>
              </section>
            )}
            {hotel.area_description && (
              <section>
                <h2 className="text-base font-semibold text-gray-900 mb-3">The neighborhood</h2>
                <p className="text-gray-700 text-sm leading-7">{stripHtml(hotel.area_description)}</p>
              </section>
            )}
          </div>
        )}

        {/* ── Amenities ── */}
        {activeTab === 'amenities' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {AMENITY_CATEGORY_KEYS.map(key => {
              const items = parseArrayField((hotel as unknown as Record<string, unknown>)[key]);
              if (items.length === 0) return null;
              return (
                <section key={key} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    {AMENITY_CATEGORY_LABELS[key]}
                  </h3>
                  <ul className="space-y-1.5">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-[#0071c2] mt-0.5 shrink-0 font-bold">✓</span>
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
          <div className="max-w-3xl space-y-4">
            {/* Check-in / Check-out times */}
            {(hotel.check_in_start_time || hotel.check_in_end_time || hotel.check_out_time) && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">Check-in &amp; Check-out</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {(hotel.check_in_start_time || hotel.check_in_end_time) && (
                    <PolicyRow
                      icon="🔑"
                      label="Check-in"
                      items={[
                        hotel.check_in_start_time ? `From ${hotel.check_in_start_time}` : null,
                        hotel.check_in_end_time ? `Until ${hotel.check_in_end_time}` : null,
                      ].filter(Boolean) as string[]}
                    />
                  )}
                  {hotel.check_out_time && (
                    <PolicyRow icon="🚪" label="Check-out" items={[`By ${hotel.check_out_time}`]} />
                  )}
                  {checkOutPolicyItems.length > 0 && (
                    <PolicyRow icon="📋" label="Check-out policy" items={checkOutPolicyItems} />
                  )}
                </div>
              </div>
            )}

            {checkInInstructions.length > 0 && (
              <PolicyCard icon="ℹ️" label="Check-in instructions" items={checkInInstructions} />
            )}
            {petPolicyItems.length > 0 && (
              <PolicyCard icon="🐾" label="Pet policy" items={petPolicyItems} />
            )}
            {childrenPolicyItems.length > 0 && (
              <PolicyCard icon="👶" label="Children &amp; extra beds" items={childrenPolicyItems} />
            )}
            {knowBeforeYouGo.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-2">
                  <span>📌</span> Know before you go
                </h3>
                <ul className="space-y-2">
                  {knowBeforeYouGo.map((item, i) => (
                    <li key={i} className="text-sm text-amber-800 flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 text-amber-500">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Reviews ── */}
        {activeTab === 'reviews' && (
          <div className="space-y-8">
            <ReviewInput propertyId={hotel.eg_property_id} userId={userId} username={username} />
            <ReviewFeed reviews={reviews} userTags={userTags} />
          </div>
        )}
      </div>
    </div>
  );
}

function PolicyRow({ icon, label, items }: { icon: string; label: string; items: string[] }) {
  return (
    <div className="px-5 py-3 flex items-start gap-3">
      <span className="text-base mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
        {items.map((item, i) => (
          <p key={i} className="text-sm text-gray-800">{item}</p>
        ))}
      </div>
    </div>
  );
}

function PolicyCard({ icon, label, items }: { icon: string; label: string; items: string[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <span>{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
      </div>
      <ul className="px-5 py-3 space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
            <span className="text-gray-300 shrink-0 mt-0.5">›</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
