'use client';

import { useState, useTransition, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, PencilLine, Plus, UserRound, X } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

// ─── Tag definitions (PRD Feature 1) ──────────────────────────────────────────
// Each entry maps exactly to a (tag, category) pair, matching the User_Personas
// parallel-array schema: tags[] and categories[].

interface TagDef {
  tag: string;
  category: string;
}

const PRESET_GROUPS: { heading: string; items: TagDef[] }[] = [
  {
    heading: 'Travel Style',
    items: [
      { tag: 'Business traveler', category: 'Travel Style' },
      { tag: 'Solo traveler', category: 'Travel Style' },
      { tag: 'Family traveler', category: 'Travel Style' },
      { tag: 'Couple traveler', category: 'Travel Style' },
      { tag: 'Group traveler', category: 'Travel Style' },
      { tag: 'Backpacker', category: 'Travel Style' },
      { tag: 'Budget traveler', category: 'Travel Style' },
      { tag: 'Luxury traveler', category: 'Travel Style' },
      { tag: 'Road tripper', category: 'Travel Style' },
      { tag: 'Long-stay traveler', category: 'Travel Style' },
    ],
  },
  {
    heading: 'Trip Purpose',
    items: [
      { tag: 'Tourist', category: 'Trip Purpose' },
      { tag: 'Weekend getaway', category: 'Trip Purpose' },
      { tag: 'Event traveler', category: 'Trip Purpose' },
      { tag: 'Convention attendee', category: 'Trip Purpose' },
      { tag: 'Wellness traveler', category: 'Trip Purpose' },
      { tag: 'Adventure traveler', category: 'Trip Purpose' },
      { tag: 'Digital nomad', category: 'Trip Purpose' },
      { tag: 'Remote worker', category: 'Trip Purpose' },
    ],
  },
  {
    heading: 'Accessibility',
    items: [
      { tag: 'Wheelchair user', category: 'Accessibility' },
      { tag: 'Mobility aid user', category: 'Accessibility' },
      { tag: 'Visual impairment', category: 'Accessibility' },
      { tag: 'Hearing impairment', category: 'Accessibility' },
      { tag: 'Step-free access needed', category: 'Accessibility' },
      { tag: 'Elevator access needed', category: 'Accessibility' },
      { tag: 'Accessible bathroom needed', category: 'Accessibility' },
    ],
  },
  {
    heading: 'Sensory & Health',
    items: [
      { tag: 'Neurodivergent', category: 'Sensory & Health' },
      { tag: 'Sensory-sensitive', category: 'Sensory & Health' },
      { tag: 'Light sleeper', category: 'Sensory & Health' },
      { tag: 'Chronic illness', category: 'Sensory & Health' },
      { tag: 'Dietary restrictions', category: 'Sensory & Health' },
      { tag: 'Fragrance-sensitive', category: 'Sensory & Health' },
      { tag: 'Air quality sensitive', category: 'Sensory & Health' },
    ],
  },
  {
    heading: 'Companions & Household',
    items: [
      { tag: 'Pet owner', category: 'Companions & Household' },
      { tag: 'Guide dog owner', category: 'Companions & Household' },
      { tag: 'Traveling with baby/toddler', category: 'Companions & Household' },
      { tag: 'Traveling with kids', category: 'Companions & Household' },
      { tag: 'Traveling with teens', category: 'Companions & Household' },
      { tag: 'Senior traveler', category: 'Companions & Household' },
      { tag: 'Caregiver traveler', category: 'Companions & Household' },
    ],
  },
  {
    heading: 'Priorities & Preferences',
    items: [
      { tag: 'Quiet', category: 'Priorities & Preferences' },
      { tag: 'Safety-conscious', category: 'Priorities & Preferences' },
      { tag: 'Cleanliness-focused', category: 'Priorities & Preferences' },
      { tag: 'Fast WiFi', category: 'Priorities & Preferences' },
      { tag: 'Breakfast-first', category: 'Priorities & Preferences' },
      { tag: 'Parking needed', category: 'Priorities & Preferences' },
      { tag: 'Transit-first', category: 'Priorities & Preferences' },
      { tag: 'Walkable area', category: 'Priorities & Preferences' },
      { tag: 'Spacious room', category: 'Priorities & Preferences' },
      { tag: 'Strong AC', category: 'Priorities & Preferences' },
      { tag: 'Gym access', category: 'Priorities & Preferences' },
      { tag: 'Pool access', category: 'Priorities & Preferences' },
      { tag: 'Spa & relaxation', category: 'Priorities & Preferences' },
      { tag: 'Eco-conscious', category: 'Priorities & Preferences' },
      { tag: 'Foodie', category: 'Priorities & Preferences' },
      { tag: 'Culture enthusiast', category: 'Priorities & Preferences' },
    ],
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface PersonaTaggerProps {
  userId: string;
  username: string;
  initialSelectedTags?: string[];
  initialCategories?: string[];
  hasSavedProfile?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PRESET_TAGS = new Set(PRESET_GROUPS.flatMap(group => group.items.map(item => item.tag)));

export default function PersonaTagger({
  userId,
  username,
  initialSelectedTags = [],
  initialCategories = [],
  hasSavedProfile = false,
}: PersonaTaggerProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelectedTags));
  const [customTags, setCustomTags] = useState<string[]>(() =>
    initialSelectedTags.filter(tag => !PRESET_TAGS.has(tag))
  );
  const [isEditing, setIsEditing] = useState(!hasSavedProfile);
  const [profileSaved, setProfileSaved] = useState(hasSavedProfile);
  const [inputValue, setInputValue] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const initialCategoryByTag = new Map(
    initialSelectedTags.map((tag, index) => [tag, initialCategories[index] ?? 'Custom'])
  );
  const presetCategoryByTag = new Map(
    PRESET_GROUPS.flatMap(group => group.items.map(item => [item.tag, item.category] as const))
  );
  const trimmedSearch = searchValue.trim().toLowerCase();
  const visibleGroups = PRESET_GROUPS
    .map(group => {
      if (!trimmedSearch) {
        return group;
      }

      const groupMatches = group.heading.toLowerCase().includes(trimmedSearch);
      return {
        ...group,
        items: groupMatches
          ? group.items
          : group.items.filter(item => item.tag.toLowerCase().includes(trimmedSearch)),
      };
    })
    .filter(group => group.items.length > 0);
  const summaryGroups = Array.from(selected).reduce<Record<string, string[]>>((acc, tag) => {
    const category = presetCategoryByTag.get(tag) ?? initialCategoryByTag.get(tag) ?? 'Custom';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(tag);
    return acc;
  }, {});
  const additionalSummaryGroups = Object.entries(summaryGroups).filter(
    ([category]) => category !== 'Custom' && !PRESET_GROUPS.some(group => group.heading === category)
  );

  // Toggle a preset tag on/off
  function toggleTag(tag: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
    setStatus('idle');
  }

  // Add a custom tag from the input field
  function commitCustomTag() {
    const trimmed = inputValue.trim();
    if (!trimmed || customTags.includes(trimmed)) {
      setInputValue('');
      return;
    }
    setCustomTags(prev => [...prev, trimmed]);
    setSelected(prev => new Set(prev).add(trimmed));
    setInputValue('');
    setStatus('idle');
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitCustomTag();
    }
  }

  function removeCustomTag(tag: string) {
    setCustomTags(prev => prev.filter(t => t !== tag));
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(tag);
      return next;
    });
    setStatus('idle');
  }

  // Build parallel arrays and upsert into User_Personas
  async function save() {
    // Collect all selected preset tags with their categories
    const allPresetDefs: TagDef[] = PRESET_GROUPS.flatMap(g => g.items);
    const tagsArr: string[] = [];
    const categoriesArr: string[] = [];

    for (const tagStr of selected) {
      const preset = allPresetDefs.find(d => d.tag === tagStr);
      tagsArr.push(tagStr);
      categoriesArr.push(preset ? preset.category : 'Custom');
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('User_Personas')
      .upsert(
        {
          user_id: userId,
          username,
          tags: tagsArr,
          categories: categoriesArr,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) throw error;
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        await save();
        setStatus('success');
        setProfileSaved(true);
        setIsEditing(false);
        router.refresh();
      } catch {
        setStatus('error');
      }
    });
  }

  function handleSkip() {
    router.push('/');
  }

  const totalSelected = selected.size;

  if (!isEditing && profileSaved) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"
          >
            <div className="border-b border-gray-100 bg-gradient-to-r from-[#003580] to-[#005db8] px-6 py-8 text-white sm:px-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-50">
                    <UserRound size={14} />
                    My Profile
                  </div>
                  <h1 className="mt-4 text-3xl font-bold tracking-tight">{username}</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50/90">
                    These tags shape which reviews feel most relevant to you and which follow-up questions PARC prioritizes.
                  </p>
                </div>

                <div className="flex shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setStatus('idle');
                      setIsEditing(true);
                    }}
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#003580] transition hover:bg-blue-50"
                  >
                    <PencilLine size={16} />
                    Edit Tags
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 py-7 sm:px-8">
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700">
                  {totalSelected} tag{totalSelected !== 1 ? 's' : ''} selected
                </span>
                <span>Signed in as {username}</span>
              </div>

              <div className="mt-7 space-y-6">
                {PRESET_GROUPS.map(group => {
                  const items = summaryGroups[group.heading] ?? [];
                  if (items.length === 0) {
                    return null;
                  }

                  return (
                  <section key={group.heading}>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {group.heading}
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {items.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>
                  );
                })}

                {(summaryGroups.Custom ?? []).length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Custom Tags
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(summaryGroups.Custom ?? []).map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {additionalSummaryGroups.map(([category, items]) => (
                  <section key={category}>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {category}
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {items.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </motion.section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      {/* Header */}
      <div className="w-full max-w-2xl mb-8 text-center">
        <motion.h1
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-3xl font-bold text-gray-900 tracking-tight"
        >
          {profileSaved ? 'Edit your profile' : 'Tell us about yourself'}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="mt-2 text-gray-500 text-base"
        >
          Select any tags that describe you. We use these to surface reviews from
          travelers with similar needs.
        </motion.p>
        <p className="mt-3 text-sm font-medium text-[#003580]">
          Signed in as {username}
        </p>
      </div>

      {/* Tag groups */}
      <div className="w-full max-w-2xl space-y-7">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Find Tags
          </h2>
          <input
            type="text"
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            placeholder="Search tags or categories…"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#0071c2] focus:border-transparent bg-white placeholder-gray-400"
          />
        </section>

        {visibleGroups.map((group, gi) => (
          <motion.section
            key={group.heading}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: gi * 0.06 }}
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              {group.heading}
            </h2>
            <div className="flex flex-wrap gap-2">
              {group.items.map(({ tag }) => {
                const isSelected = selected.has(tag);
                return (
                  <TagChip
                    key={tag}
                    label={tag}
                    selected={isSelected}
                    onToggle={() => toggleTag(tag)}
                  />
                );
              })}
            </div>
          </motion.section>
        ))}

        {trimmedSearch && visibleGroups.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500">
            No preset tags matched your search.
          </div>
        )}

        {/* Custom tags section */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: visibleGroups.length * 0.06 }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Custom Tags
          </h2>
          <div className="flex flex-wrap gap-2 mb-3">
            <AnimatePresence>
              {customTags.map(tag => (
                <motion.span
                  key={tag}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.7, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="inline-flex items-center gap-1 bg-[#003580] text-white text-sm font-medium px-3 py-1.5 rounded-full"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeCustomTag(tag)}
                    className="ml-0.5 hover:text-blue-200 transition-colors"
                    aria-label={`Remove ${tag}`}
                  >
                    <X size={13} strokeWidth={2.5} />
                  </button>
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Type a tag and press Enter…"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0071c2] focus:border-transparent bg-white placeholder-gray-400"
            />
            <button
              type="button"
              onClick={commitCustomTag}
              disabled={!inputValue.trim()}
              className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <Plus size={15} /> Add
            </button>
          </div>
        </motion.section>
      </div>

      {/* Footer actions */}
      <div className="w-full max-w-2xl mt-10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          onClick={profileSaved ? () => setIsEditing(false) : handleSkip}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
        >
          {profileSaved ? 'Back to profile' : 'Skip for now'}
        </button>

        <div className="flex items-center gap-3">
          {totalSelected > 0 && (
            <span className="text-xs text-gray-400 tabular-nums">
              {totalSelected} tag{totalSelected !== 1 ? 's' : ''} selected
            </span>
          )}
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || totalSelected === 0 || status === 'success'}
            whileTap={{ scale: 0.97 }}
            className="relative flex items-center gap-2 bg-[#003580] hover:bg-[#0052b3] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors min-w-[120px] justify-center"
          >
            <AnimatePresence mode="wait">
              {status === 'success' ? (
                <motion.span
                  key="done"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5"
                >
                  <Check size={15} /> Saved!
                </motion.span>
              ) : isPending ? (
                <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  Saving…
                </motion.span>
              ) : (
                <motion.span key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {profileSaved ? 'Save Profile' : 'Save Profile'}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* Error notice */}
      <AnimatePresence>
        {status === 'error' && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 text-sm text-red-500"
          >
            Something went wrong saving your preferences. Please try again.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── TagChip ──────────────────────────────────────────────────────────────────

interface TagChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
}

function TagChip({ label, selected, onToggle }: TagChipProps) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={{ scale: 0.94 }}
      animate={selected ? { scale: 1 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 20 }}
      aria-pressed={selected}
      className={[
        'inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors duration-150',
        selected
          ? 'bg-[#003580] border-[#003580] text-white shadow-sm'
          : 'bg-white border-gray-300 text-gray-700 hover:border-[#0071c2] hover:text-[#0071c2]',
      ].join(' ')}
    >
      <AnimatePresence>
        {selected && (
          <motion.span
            key="check"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 14, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden flex items-center"
          >
            <Check size={12} strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
      {label}
    </motion.button>
  );
}
