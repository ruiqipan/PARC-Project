'use client';

import { TravelerPersona } from '@/types';
import { useState } from 'react';

interface PersonaSelectorProps {
  current: TravelerPersona;
  onChange: (p: TravelerPersona) => void;
}

const PERSONAS: { value: TravelerPersona; label: string; icon: string }[] = [
  { value: 'business', label: 'Business', icon: '💼' },
  { value: 'family', label: 'Family', icon: '👨‍👩‍👧' },
  { value: 'solo', label: 'Solo', icon: '🧳' },
  { value: 'couple', label: 'Couple', icon: '💑' },
  { value: 'car', label: 'Road trip', icon: '🚗' },
  { value: 'accessibility', label: 'Accessibility', icon: '♿' },
];

export default function PersonaSelector({ current, onChange }: PersonaSelectorProps) {
  const [open, setOpen] = useState(false);
  const currentData = PERSONAS.find(p => p.value === current) || PERSONAS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-full px-3 py-1.5 hover:bg-blue-100 transition-colors"
      >
        <span>{currentData.icon}</span>
        <span className="font-medium">{currentData.label} traveler</span>
        <span className="text-blue-400 text-xs">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-2 z-20 bg-white rounded-xl shadow-lg border border-gray-100 p-2 min-w-[200px]">
            <p className="text-xs text-gray-500 px-2 py-1 font-medium">I&apos;m traveling as…</p>
            {PERSONAS.map(p => (
              <button
                key={p.value}
                onClick={() => { onChange(p.value); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  current === p.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
                {current === p.value && <span className="ml-auto text-blue-600">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
