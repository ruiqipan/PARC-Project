'use client';

import { useState, useEffect, useTransition, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Plus, X } from 'lucide-react';
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
      { tag: 'Solo traveler',     category: 'Travel Style' },
      { tag: 'Family traveler',   category: 'Travel Style' },
      { tag: 'Backpacker',        category: 'Travel Style' },
      { tag: 'Luxury traveler',   category: 'Travel Style' },
    ],
  },
  {
    heading: 'Accessibility',
    items: [
      { tag: 'Wheelchair user',  category: 'Accessibility' },
      { tag: 'Guide dog owner',  category: 'Accessibility' },
      { tag: 'Visual impairment', category: 'Accessibility' },
      { tag: 'Hearing impairment', category: 'Accessibility' },
      { tag: 'Mobility aid user', category: 'Accessibility' },
    ],
  },
  {
    heading: 'Health & Wellness',
    items: [
      { tag: 'Neurodivergent',        category: 'Health & Wellness' },
      { tag: 'Chronic illness',        category: 'Health & Wellness' },
      { tag: 'Dietary restrictions',   category: 'Health & Wellness' },
    ],
  },
  {
    heading: 'Lifestyle',
    items: [
      { tag: 'Pet owner',      category: 'Lifestyle' },
      { tag: 'Eco-conscious',  category: 'Lifestyle' },
      { tag: 'Remote worker',  category: 'Lifestyle' },
    ],
  },
  {
    heading: 'Preferences',
    items: [
      { tag: 'Quiet',              category: 'Preference' },
      { tag: 'Adventure seeker',   category: 'Preference' },
      { tag: 'Culture enthusiast', category: 'Preference' },
      { tag: 'Foodie',             category: 'Preference' },
    ],
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface PersonaTaggerProps {
  userId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PersonaTagger({ userId }: PersonaTaggerProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Toggle a preset tag on/off
  function toggleTag(tag: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
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
        { user_id: userId, tags: tagsArr, categories: categoriesArr, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (error) throw error;
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        await save();
        setStatus('success');
        setTimeout(() => router.push('/'), 900);
      } catch {
        setStatus('error');
      }
    });
  }

  function handleSkip() {
    router.push('/');
  }

  const totalSelected = selected.size;

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
          Tell us about yourself
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
      </div>

      {/* Tag groups */}
      <div className="w-full max-w-2xl space-y-7">
        {PRESET_GROUPS.map((group, gi) => (
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

        {/* Custom tags section */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: PRESET_GROUPS.length * 0.06 }}
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
          onClick={handleSkip}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
        >
          Skip for now
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
                  Save &amp; Continue
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
