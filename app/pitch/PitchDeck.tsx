'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion, useAnimation, useInView } from 'framer-motion';
import {
  RefreshCw,
  Database,
  Cpu,
  Layers,
  Target,
  Zap,
  CheckCircle2,
  TrendingDown,
  Search,
  MessageSquare,
  Activity,
  AlertCircle,
  BarChart3,
  Users,
  BrainCircuit,
  ArrowRightLeft,
  ChevronDown,
  Clock,
  ShieldCheck
} from 'lucide-react';

// --- Reusable Components ---

const Section = ({ children, className = "", id = "" }: { children: React.ReactNode, className?: string, id?: string }) => (
  <section id={id} className={`min-h-screen w-full flex flex-col items-center justify-center p-8 md:p-20 scroll-mt-0 relative ${className}`}>
    <div className="max-w-7xl w-full relative z-10">
      {children}
    </div>
  </section>
);

const Title = ({ children }: { children: React.ReactNode }) => (
  <motion.h2
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6 }}
    className="text-4xl md:text-5xl font-bold mb-5 text-slate-900 tracking-tight text-center"
  >
    {children}
  </motion.h2>
);

const Subtitle = ({ children }: { children: React.ReactNode }) => (
  <motion.p
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay: 0.1 }}
    className="text-lg md:text-xl text-slate-500 mb-12 max-w-3xl mx-auto leading-relaxed text-center"
  >
    {children}
  </motion.p>
);

const Card = ({ title, icon: Icon, description, delay = 0, highlight = false, children }: {
  title: string;
  icon: React.ElementType;
  description: string;
  delay?: number;
  highlight?: boolean;
  children?: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className={`p-8 rounded-3xl border h-full ${highlight ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-900 border-slate-200'} shadow-sm`}
  >
    {Icon && <Icon className={`w-8 h-8 mb-6 ${highlight ? 'text-blue-400' : 'text-blue-600'}`} />}
    <h3 className="text-base font-semibold mb-3">{title}</h3>
    <p className={`text-sm mb-4 ${highlight ? 'text-slate-400' : 'text-slate-500'}`}>{description}</p>
    {children}
  </motion.div>
);

// --- Decay Chart Component ---
const DecayChart = () => {
  const curves = [
    { label: 'Cleanliness', halfLife: 7, color: '#ef4444' },
    { label: 'Wifi/Parking', halfLife: 30, color: '#3b82f6' },
    { label: 'Pet Policy/Safety', halfLife: 90, color: '#f59e0b' },
    { label: 'Transit', halfLife: 365, color: '#10b981' },
  ];

  const generatePath = (halfLife: number) => {
    const k = Math.log(2) / halfLife;
    let path = "M 0 0";
    for (let t = 0; t <= 365; t += 5) {
      const y = Math.round(200 * (1 - Math.exp(-k * t)) * 100) / 100;
      path += ` L ${t} ${y}`;
    }
    return path;
  };

  return (
    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 relative h-64 w-full">
      <div className="absolute top-2 left-4 text-[10px] font-mono text-slate-400 uppercase tracking-widest">Staleness Index (0 → 1.0)</div>
      <svg viewBox="0 0 365 200" className="w-full h-full overflow-visible">
        <line x1="0" y1="0" x2="365" y2="0" stroke="#e2e8f0" strokeWidth="1" />
        <line x1="0" y1="200" x2="365" y2="200" stroke="#e2e8f0" strokeWidth="1" />
        {curves.map((c, i) => (
          <motion.path
            key={i}
            d={generatePath(c.halfLife)}
            fill="none"
            stroke={c.color}
            strokeWidth="3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, delay: i * 0.2 }}
          />
        ))}
      </svg>
      <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-mono">
        <span>DAY 0</span>
        <span>DAY 180</span>
        <span>DAY 365 (TIME AXIS)</span>
      </div>
    </div>
  );
};

// 6 comments in a hexagonal orbit around the center card:
//   top-center, top-right, bottom-right, bottom-center, bottom-left, top-left
const BACKGROUND_COMMENTS = [
  { text: '"WiFi was fast enough for back-to-back video calls."', tag: 'Business Traveler', left: '41%',      right: undefined, y: '12%', delay: 0.2 }, // top-center
  { text: '"Surprisingly quiet — slept better than at home."',    tag: 'Light Sleeper',     left: undefined,  right: '15%',     y: '30%', delay: 0.5 }, // top-right
  { text: '"They actually welcomed our dog at check-in!"',        tag: 'Pet Owner',         left: undefined,  right: '15%',     y: '66%', delay: 0.8 }, // bottom-right
  { text: '"Check-in at 11pm was completely seamless."',          tag: 'Late Arrival',      left: '41%',      right: undefined, y: '80%', delay: 0.4 }, // bottom-center
  { text: '"Pool was open and warm — kids loved it."',            tag: 'Family Traveler',   left: '15%',      right: undefined, y: '66%', delay: 0.9 }, // bottom-left
  { text: '"Breakfast had solid gluten-free options."',           tag: 'Dietary Needs',     left: '15%',      right: undefined, y: '30%', delay: 0.6 }, // top-left
];

// --- Final slide: scroll-in → card clears → floating comments → click Book Now → black + slogan ---
function FinalSlide() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.6 });
  const [booked, setBooked] = useState(false);
  const cardControls = useAnimation();
  const commentsControls = useAnimation();
  const overlayControls = useAnimation();
  const textControls = useAnimation();

  // Phase 1: scroll-in → card sharpens → comments drift in
  useEffect(() => {
    if (!isInView) return;
    const run = async () => {
      await cardControls.start({
        filter: 'blur(0px)', opacity: 1,
        transition: { duration: 1.4, ease: 'easeOut' },
      });
      await commentsControls.start({
        opacity: 1,
        transition: { duration: 0.8, ease: 'easeOut' },
      });
    };
    run();
  }, [isInView, cardControls, commentsControls]);

  // Phase 2: Book Now clicked → card + comments fade → black → slogan
  const handleBook = async () => {
    if (booked) return;
    setBooked(true);
    cardControls.start({ opacity: 0, transition: { duration: 1, ease: 'easeIn' } });
    commentsControls.start({ opacity: 0, transition: { duration: 0.8, ease: 'easeIn' } });
    await overlayControls.start({ opacity: 1, transition: { duration: 1.4, ease: 'easeIn' } });
    await textControls.start({ opacity: 1, transition: { duration: 1.2, ease: 'easeOut' } });
  };

  return (
    <section ref={ref} className="min-h-screen w-full scroll-mt-0 relative overflow-hidden bg-black flex items-center justify-center">
      {/* Background photo */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: `url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80')` }}
      >
        <div className="absolute inset-0 bg-black/65" />
      </div>

      {/* Floating background comments */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={commentsControls}
        className="absolute inset-0 z-10 pointer-events-none"
      >
        {BACKGROUND_COMMENTS.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: [0, 0.75, 0.65, 0.75], y: [8, 0, -4, 0] }}
            transition={{ opacity: { duration: 1.2, delay: c.delay }, y: { duration: 5, delay: c.delay, repeat: Infinity, ease: 'easeInOut' } }}
            className="absolute max-w-[220px]"
            style={{ left: c.left, right: c.right, top: c.y }}
          >
            <div className="bg-white/15 border border-white/30 backdrop-blur-md rounded-2xl px-3 py-2">
              <p className="text-white/90 text-[11px] leading-relaxed italic mb-1.5">{c.text}</p>
              <span className="text-[9px] px-2 py-0.5 bg-blue-500/40 text-blue-200 rounded-full font-medium">{c.tag}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Hotel card — blurry on load, sharpens, stays until Book Now */}
      <motion.div
        initial={{ filter: 'blur(20px)', opacity: 0 }}
        animate={cardControls}
        className="relative z-20 w-[370px] mx-auto"
      >
        <div className="bg-white/10 border border-white/20 backdrop-blur-md rounded-3xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-white font-bold text-lg">Omni Interlocken Hotel</div>
              <div className="text-white/50 text-sm">Broomfield, Colorado · ★ 4.6</div>
            </div>
            <div className="bg-green-500/20 border border-green-400/40 rounded-xl px-3 py-1.5 text-green-400 text-xs font-bold">
              Verified ✓
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[{ label: 'WiFi', score: '4.8' }, { label: 'Noise', score: '4.2' }, { label: 'Check-in', score: '4.9' }].map((attr, i) => (
              <div key={i} className="bg-white/10 rounded-2xl p-3 text-center">
                <div className="text-white/50 text-[10px] mb-1">{attr.label}</div>
                <div className="text-white font-black text-xl">{attr.score}</div>
                <div className="text-green-400 text-[9px] mt-1 font-mono">● Fresh</div>
              </div>
            ))}
          </div>
          <button
            onClick={handleBook}
            className="w-full bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all text-white font-bold py-3 rounded-2xl text-base cursor-pointer"
          >
            Book Now
          </button>
        </div>
      </motion.div>

      {/* Black overlay — triggered by Book Now */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={overlayControls}
        className="absolute inset-0 z-30 bg-black pointer-events-none"
      />

      {/* Slogan — on pure black */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={textControls}
        className="absolute inset-0 z-40 flex flex-col items-center justify-center text-center px-8 pointer-events-none"
      >
        <h1 className="text-5xl md:text-8xl font-bold text-white tracking-tight">
          Know before you go.
        </h1>
        <p className="mt-8 text-white/30 text-xs italic tracking-widest uppercase font-mono">
          PRISM by PARC Group
        </p>
      </motion.div>
    </section>
  );
}

// --- Main App ---

export default function PitchDeck() {
  return (
    <div className="bg-slate-50 font-sans selection:bg-blue-100 selection:text-blue-900 h-screen overflow-y-auto">

      {/* 🎬 Slide 0: Opening / System Identity */}
      <section className="min-h-screen w-full flex items-center justify-center scroll-mt-0 relative overflow-hidden bg-black">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1920&q=80')`,
          }}
        >
          <div className="absolute inset-0 bg-black/55"></div>
        </div>

        <div className="relative z-10 text-center px-6">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-5xl md:text-8xl font-bold text-white mb-6 tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
          >
            PRISM
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-xl md:text-2xl text-white/80 mb-10 tracking-wide font-light"
          >
            Property Review Intelligence &amp; Staleness Management
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="max-w-2xl mx-auto border-t border-white/20 pt-8"
          >
            <p className="text-base md:text-lg text-white/70 leading-relaxed italic">
              &ldquo;Reviews are not static text — they are signals that continuously reshape what we know about a place.&rdquo;
            </p>
          </motion.div>

          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, delay: 1.5 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/40"
          >
            <ChevronDown className="w-8 h-8" />
          </motion.div>
        </div>
      </section>

      {/* Slide 1: Motivation — The Real Problem (Expedia-style) */}
      <section className="min-h-screen w-full flex flex-col items-center justify-center scroll-mt-0 relative overflow-hidden bg-white">
        {/* Expedia-style top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#FFC72C] via-[#FFDD6B] to-[#FFC72C]" />

        {/* Subtle warm grid */}
        <div className="absolute inset-0 opacity-[0.035]" style={{
          backgroundImage: 'linear-gradient(#FFC72C 1px, transparent 1px), linear-gradient(90deg, #FFC72C 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }} />

        {/* Warm top-right glow */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#FFC72C]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#003580]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-6xl w-full px-8 md:px-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 bg-[#FFC72C]/15 border border-[#FFC72C]/40 rounded-full px-4 py-1.5 mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-[#FFC72C] inline-block" />
            <span className="text-[#8B6A00] font-semibold uppercase tracking-widest text-[11px]">Why This Matters</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-slate-900 mb-5 tracking-tight leading-tight"
          >
            Generic reviews fail<br />
            <span className="text-[#003580]">real travelers</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg text-slate-500 mb-14 max-w-2xl mx-auto leading-relaxed"
          >
            The gap between what&apos;s written and what&apos;s real — for the traveler who actually needs to know — is costing trust.
          </motion.p>

          {/* Three stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left mb-12">
            {/* Stat 1 */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="bg-white border border-slate-200 rounded-3xl p-7 flex flex-col shadow-sm"
            >
              <div className="text-5xl font-black text-red-500 mb-1 leading-none">54%</div>
              <div className="text-slate-400 text-[10px] font-mono uppercase tracking-widest mb-4">+ 81%</div>
              <p className="text-slate-700 text-sm leading-relaxed flex-1">
                of travelers with disabilities were assigned rooms inconsistent with their booking —
                and <span className="text-slate-900 font-semibold">81%</span> encountered bathrooms that were not accessible as described.
              </p>
              <div className="mt-5 pt-4 border-t border-slate-100">
                <span className="text-slate-400 text-[10px] font-mono leading-snug">MMGY Global · Portrait of Travelers with Disabilities · 2022</span>
              </div>
            </motion.div>

            {/* Stat 2 */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="bg-[#003580] rounded-3xl p-7 flex flex-col shadow-sm"
            >
              <div className="text-5xl font-black text-[#FFC72C] mb-1 leading-none">83%</div>
              <div className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-4">+ 46% critical</div>
              <p className="text-white/85 text-sm leading-relaxed flex-1">
                of travelers say reviews from <span className="text-white font-semibold">people like them</span> are important to booking decisions —
                nearly half call it a <span className="text-white font-semibold">critical factor</span>.
              </p>
              <div className="mt-5 pt-4 border-t border-white/15">
                <span className="text-white/40 text-[10px] font-mono leading-snug">Expedia Group · Empowering Inclusivity in Travel · 2024</span>
              </div>
            </motion.div>

            {/* Stat 3 */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="bg-white border border-slate-200 rounded-3xl p-7 flex flex-col shadow-sm"
            >
              <div className="text-5xl font-black text-amber-500 mb-1 leading-none">69%</div>
              <div className="text-slate-400 text-[10px] font-mono uppercase tracking-widest mb-4">neurodivergent travelers</div>
              <p className="text-slate-700 text-sm leading-relaxed flex-1">
                need more detailed accommodation information before booking —
                yet <span className="text-slate-900 font-semibold">49%</span> still report negative experiences due to unmet expectations.
              </p>
              <div className="mt-5 pt-4 border-t border-slate-100">
                <span className="text-slate-400 text-[10px] font-mono leading-snug">Booking.com · Neurodivergent Travelers Research · 2025</span>
              </div>
            </motion.div>
          </div>

          {/* Bottom insight */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.75 }}
            className="inline-flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-3"
          >
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-slate-600 text-sm">
              Current review systems don&apos;t know <em>who</em> is reading — or <em>what</em> information has gone stale.
            </span>
          </motion.div>
        </div>

        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay: 1.5 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-slate-300 z-20"
        >
          <ChevronDown className="w-8 h-8" />
        </motion.div>
      </section>

      {/* Slide 2: From Reviews to Reliable Reality — cinematic narrative */}
      <section className="min-h-screen w-full flex flex-col items-center justify-center scroll-mt-0 relative overflow-hidden bg-black">
        {/* Background: aerial city nightscape */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=80')` }}
        >
          <div className="absolute inset-0 bg-black/78" />
        </div>

        {/* Animated data-flow SVG overlay */}
        <svg className="absolute inset-0 w-full h-full z-10 pointer-events-none opacity-30" preserveAspectRatio="xMidYMid slice">
          {[
            { x1: '10%', y1: '20%', x2: '40%', y2: '55%', delay: 0 },
            { x1: '40%', y1: '55%', x2: '70%', y2: '30%', delay: 0.4 },
            { x1: '70%', y1: '30%', x2: '90%', y2: '65%', delay: 0.8 },
            { x1: '20%', y1: '75%', x2: '55%', y2: '45%', delay: 0.3 },
            { x1: '55%', y1: '45%', x2: '80%', y2: '80%', delay: 0.7 },
          ].map((l, i) => (
            <motion.line
              key={i}
              x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke="#3b82f6" strokeWidth="1"
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.5, delay: l.delay, repeat: Infinity, repeatDelay: 3 }}
            />
          ))}
          {[
            { cx: '10%', cy: '20%' }, { cx: '40%', cy: '55%' },
            { cx: '70%', cy: '30%' }, { cx: '90%', cy: '65%' },
            { cx: '20%', cy: '75%' }, { cx: '55%', cy: '45%' },
            { cx: '80%', cy: '80%' },
          ].map((c, i) => (
            <motion.circle
              key={i} cx={c.cx} cy={c.cy} r="4"
              fill="#3b82f6"
              initial={{ opacity: 0, scale: 0 }}
              whileInView={{ opacity: [0, 1, 0.6], scale: [0, 1.4, 1] }}
              transition={{ duration: 1, delay: i * 0.15, repeat: Infinity, repeatDelay: 2.5 }}
            />
          ))}
        </svg>

        {/* Content */}
        <div className="relative z-20 max-w-5xl w-full px-8 md:px-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-blue-400 font-semibold uppercase tracking-widest text-xs mb-6"
          >
            Property Knowledge Engine
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight leading-tight"
          >
            From Reviews<br />to Reliable Reality
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="text-lg md:text-xl text-white/80 mb-14 max-w-3xl mx-auto leading-relaxed"
          >
            Reviews are not just expressions — they become a system that continuously calibrates reality.
          </motion.p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {[
              { icon: '🔍', title: 'Detect Gaps & Decay', body: "The system continuously monitors every attribute's information health, proactively triggering enrichment before data becomes stale." },
              { icon: '🎯', title: 'Route Questions Precisely', body: 'The lowest-cost follow-ups are routed to exactly the right users — asking only the right people, only the right things.' },
              { icon: '🔄', title: 'Feed Back Structured Answers', body: 'Every answer is transformed into structured, updatable decision data, driving the knowledge base to continuously evolve.' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 + i * 0.12 }}
                className="bg-white/12 border border-white/25 backdrop-blur-sm rounded-3xl p-6"
              >
                <div className="text-2xl mb-3">{item.icon}</div>
                <h4 className="text-white font-semibold mb-2 text-base">{item.title}</h4>
                <p className="text-white/75 text-sm leading-relaxed">{item.body}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="mt-12 flex items-center justify-center gap-3 flex-wrap"
          >
            {['Reviews', '→', 'Follow-ups', '→', 'Answers', '→', 'Structured Data', '→', 'Better Decisions'].map((item, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ delay: 0.9 + i * 0.08 }}
                className={item === '→'
                  ? 'text-blue-400 font-bold text-lg'
                  : 'text-white/80 text-sm font-semibold bg-white/10 border border-white/20 px-3 py-1.5 rounded-full'}
              >
                {item}
              </motion.span>
            ))}
          </motion.div>
        </div>

        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay: 1.5 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/30 z-20"
        >
          <ChevronDown className="w-8 h-8" />
        </motion.div>
      </section>

      {/* Slide 3: Algorithm Core Overview */}
      <Section className="bg-white">
        <div className="text-center mb-12">
          <motion.div className="px-4 py-1 mb-5 inline-block rounded-full bg-blue-50 text-blue-700 text-xs font-semibold tracking-widest uppercase">
            Core Algorithm Architecture
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight"
          >
            Dual-Engine Closed-Loop System
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg md:text-xl text-slate-500 mb-10 max-w-3xl mx-auto leading-relaxed"
          >
            PRISM is powered by two collaborative algorithm engines: one efficiently acquires missing information, the other refines and feeds knowledge back into the system.
          </motion.p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card
            title="Engine A: Smart Follow-up Algorithm"
            description="Focus: Extracting maximum-value information patches with minimal user burden."
            icon={MessageSquare}
          >
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">Decay Detection</span>
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">Gap Recognition</span>
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">Decision Matching</span>
            </div>
          </Card>
          <Card
            title="Engine B: Knowledge Update Algorithm"
            description="Focus: Turning fragmented guest feedback into fresher, more defensible property signals."
            icon={RefreshCw}
          >
            <div className="mt-4 flex flex-wrap gap-2 text-slate-500">
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">Feature Extraction</span>
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">Confidence Assessment</span>
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">Property Insight Refresh</span>
            </div>
          </Card>
        </div>
      </Section>

      {/* Slide 3: Information Health Detection */}
      <Section className="bg-slate-50">
        <div className="text-center mb-12">
          <motion.div className="text-blue-600 font-semibold mb-3 uppercase tracking-widest text-xs">Engine A — Attribute Layer (Detection)</motion.div>
          <Title>Information Health Detection</Title>
          <Subtitle>The system continuously evaluates which hotel attributes are stale, weakly verified, or missing useful guest evidence.</Subtitle>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col p-8 rounded-[2rem] bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <TrendingDown className="text-red-500 w-9 h-9 mb-6" />
            <div>
              <h4 className="text-xl font-bold text-slate-900 mb-3 leading-tight">① Data Decay<br/><span className="text-slate-400 font-normal text-sm">Decay-aware signals</span></h4>
              <div className="text-sm text-slate-500 leading-relaxed space-y-3">
                <p>• Each attribute layer follows its own <span className="text-slate-900 font-semibold">decay curve</span></p>
                <p>• Different <span className="text-blue-600 font-semibold">features</span> have different optimal update frequencies</p>
                <div className="pt-4 border-t border-slate-100">
                  <span className="font-semibold text-slate-900 text-xs uppercase tracking-wide">Function: Detect outdated information</span>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col p-8 rounded-[2rem] bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <Search className="text-blue-500 w-9 h-9 mb-6" />
            <div>
              <h4 className="text-xl font-bold text-slate-900 mb-3 leading-tight">② Missing Information<br/><span className="text-slate-400 font-normal text-sm">Information gaps</span></h4>
              <div className="text-sm text-slate-500 leading-relaxed space-y-3">
                <p>• Attributes claimed in official descriptions but <span className="text-slate-900 font-semibold">never user-verified</span></p>
                <p>• Absence of <span className="text-blue-600 font-semibold">commonly expected</span> cross-attribute properties</p>
                <div className="pt-4 border-t border-slate-100">
                  <span className="font-semibold text-slate-900 text-xs uppercase tracking-wide">Function: Identify gaps that should exist</span>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col p-8 rounded-[2rem] bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <AlertCircle className="text-amber-500 w-9 h-9 mb-6" />
            <div>
              <h4 className="text-xl font-bold text-slate-900 mb-3 leading-tight">③ Blind Spot Repair<br/><span className="text-slate-400 font-normal text-sm">Mismatch detection</span></h4>
              <div className="text-sm text-slate-500 leading-relaxed space-y-3">
                <p>• Cross-references <span className="text-slate-900 font-semibold">official descriptions vs. user reviews</span></p>
                <p>• Surfaces long-overlooked information blind spots</p>
                <div className="pt-4 border-t border-slate-100">
                  <span className="font-semibold text-slate-900 text-xs uppercase tracking-wide">Function: Fill essential missing attributes</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* Slide 4: Freshness Calculation Engine */}
      <Section className="bg-slate-50">
        <div className="text-center mb-12">
          <motion.div className="text-blue-600 font-semibold mb-3 uppercase tracking-widest text-xs">Freshness Calculation Architecture</motion.div>
          <Title>How Is Information Freshness Calculated?</Title>
          <Subtitle>The underlying logic PRISM uses to determine which data is stale and what questions to ask next.</Subtitle>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch relative">

          <div className="flex flex-col p-8 rounded-[2rem] bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-red-50 rounded-xl"><Clock className="text-red-500" /></div>
              <h4 className="text-base font-semibold text-slate-900">Layer 1: Decay Curves<br/><span className="text-xs font-mono text-slate-400 font-normal">Property Memory Decay Engine</span></h4>
            </div>
            <DecayChart />
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-xs border-b border-slate-100 pb-1">
                <span className="text-slate-500">Cleanliness / Construction</span>
                <span className="text-red-500 font-bold font-mono">7 Days</span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-100 pb-1">
                <span className="text-slate-500">Wifi / Parking</span>
                <span className="text-blue-500 font-bold font-mono">30 Days</span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-100 pb-1">
                <span className="text-slate-500">Safety / Accessibility</span>
                <span className="text-amber-500 font-bold font-mono">90-180 Days</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col p-8 rounded-[2rem] bg-white border border-slate-200 shadow-sm relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-blue-50 rounded-xl"><ShieldCheck className="text-blue-500" /></div>
              <h4 className="text-base font-semibold text-slate-900">Layer 2: Importance Weights<br/><span className="text-xs font-mono text-slate-400 font-normal">Decision Risk Minimization</span></h4>
            </div>
            <div className="flex-grow space-y-3 pt-4">
              {[
                { l: 'Safety', w: 10, c: '#ef4444' },
                { l: 'Check-in', w: 9, c: '#f87171' },
                { l: 'Pet/Cleanliness', w: 8, c: '#fb923c' },
                { l: 'Wifi/Construction', w: 7, c: '#fbbf24' },
                { l: 'Breakfast', w: 5, c: '#cbd5e1' },
                { l: 'Pool/Gym', w: 3, c: '#e2e8f0' },
              ].map((item, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500">
                    <span>{item.l}</span>
                    <span className="font-mono">Weight: {item.w}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${item.w * 10}%` }}
                      transition={{ duration: 1, delay: i * 0.1 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: item.c }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col p-8 rounded-[2rem] bg-white border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-yellow-50 rounded-xl"><Zap className="text-yellow-500" /></div>
              <h4 className="text-base font-semibold text-slate-900">Layer 3: Final Urgency Score<br/><span className="text-xs font-mono text-slate-400 font-normal">Follow-up Prioritization Engine</span></h4>
            </div>

            <div className="space-y-4 pt-4">
              <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center justify-between animate-pulse">
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Example Candidate</div>
                  <div className="text-lg font-bold text-slate-900">Safety <span className="text-xs font-normal text-red-500">(STALE)</span></div>
                </div>
                <div className="text-2xl font-black text-red-500 font-mono">9.8</div>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Illustrative Candidate</div>
                  <div className="text-lg font-bold text-slate-900">Wifi <span className="text-xs font-normal text-yellow-500">(STALE)</span></div>
                </div>
                <div className="text-2xl font-black text-yellow-500 font-mono">7.2</div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between opacity-60">
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Lower Priority</div>
                  <div className="text-lg font-bold text-slate-900">Gym <span className="text-xs font-normal text-blue-500">(STALE)</span></div>
                </div>
                <div className="text-2xl font-black text-blue-500 font-mono">1.5</div>
              </div>
            </div>

            <div className="mt-auto pt-8">
              <div className="p-4 rounded-xl bg-blue-600 text-white text-center font-bold text-sm flex items-center justify-center gap-2">
                <Zap className="w-4 h-4" /> Triggering Follow-up Questions
              </div>
              <div className="mt-4 text-[10px] font-mono text-slate-400 text-center">
                Selection order: review/persona fit → hotel grounding → freshness → risk
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex justify-center mt-12 gap-24 items-center">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase tracking-widest">
                <span>Decay Curve</span>
                <ArrowRightLeft className="w-4 h-4" />
                <span>Importance</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase tracking-widest">
                <span>Importance</span>
                <ArrowRightLeft className="w-4 h-4" />
                <span>Urgency Score</span>
            </div>
        </div>
      </Section>

      {/* Slide 5: Smart Follow-up Matching */}
      <Section className="bg-white">
        <div className="text-center mb-12">
          <motion.div className="text-blue-600 font-semibold mb-3 uppercase tracking-widest text-xs">Engine A — User Layer (Matching)</motion.div>
          <motion.h2 className="text-4xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">Smart Matching: Right Person, Right Question</motion.h2>
          <motion.p className="text-lg md:text-xl text-slate-500 mb-10 max-w-3xl mx-auto leading-relaxed text-center">Once a relevant topic is identified, the system decides when to surface 1–2 low-friction questions and which user context makes that question worth asking.</motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <Card title="Decision Risk Ranking" icon={BarChart3} description="After review and persona fit identify eligible topics, hotel grounding, freshness, and risk help break ties between multiple relevant candidates.">
            <div className="text-[10px] text-slate-400 mt-4 border-t pt-4">Tie-breakers: grounding → freshness → risk</div>
          </Card>
          <Card title="User Relevance Matching" icon={Users} description="The engine combines the submitted review, the user's persona tags, and real hotel/review evidence. Negative reviews stay anchored to the same pain point; positive reviews can broaden into persona-relevant topics.">
            <div className="text-[10px] text-slate-400 mt-4 border-t pt-4">Intersection → review_only → blind_spot → persona_only</div>
          </Card>
          <Card title="Low-friction Interaction Design" icon={Zap} description="Uses sliders or Yes / Neutral / No controls as the primary path, with optional text and voice tucked behind a + action to keep the flow lightweight.">
            <div className="text-[10px] text-slate-400 mt-4 border-t pt-4">Recognition {'>'} Recall Principle</div>
          </Card>
        </div>

        <div className="bg-blue-50 p-8 rounded-[2rem] border border-blue-100 relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1">
              <h4 className="text-lg font-semibold text-slate-900 mb-4">Matching Logic — Example</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="text-green-500 w-4 h-4" /> Input signal: review mentions unstable WiFi
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="text-green-500 w-4 h-4" /> Persona context: work-travel tags suggest connectivity matters
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-600">
                  <ArrowRightLeft className="w-4 h-4" /> Follow-up triggered: verify whether the WiFi was stable enough for real work.
                </div>
              </div>
            </div>
            <div className="w-full md:w-64 bg-white p-6 rounded-2xl shadow-lg border border-blue-200">
               <p className="text-xs font-semibold text-slate-400 mb-3 uppercase">User-facing prompt</p>
               <p className="text-sm font-medium mb-4">The WiFi felt stable enough for work.</p>
               <div className="grid grid-cols-3 gap-2 mb-4">
                 {['No', 'Neutral', 'Yes'].map((label, index) => (
                   <div
                     key={label}
                     className={`rounded-full border px-3 py-2 text-center text-[10px] font-semibold ${index === 2 ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-500'}`}
                   >
                     {label}
                   </div>
                 ))}
               </div>
               <p className="text-[10px] text-slate-500 font-mono mb-2">Optional follow-up detail</p>
               <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                 <span>Unusable</span>
                 <span>Stable</span>
               </div>
               <div className="w-full h-1 bg-slate-100 rounded-full relative">
                 <div className="absolute top-1/2 left-3/4 -translate-y-1/2 w-4 h-4 bg-blue-600 rounded-full shadow-md border-2 border-white"></div>
               </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Slide 6: Knowledge Update Engine */}
      <Section className="bg-slate-900 text-white">
        <div className="mb-12 text-center">
          <motion.div className="text-blue-400 font-semibold mb-3 uppercase tracking-widest text-xs">Engine B — Knowledge Feedback Layer</motion.div>
          <motion.h2 className="text-4xl md:text-5xl font-bold mb-4 text-white tracking-tight">Knowledge Update Engine: From Guest Signals to Property State</motion.h2>
          <motion.p className="text-lg md:text-xl text-slate-400 mb-10 max-w-3xl mx-auto leading-relaxed">When a user submits a review or completes a follow-up, PRISM updates freshness state and can suppress hotel claims that are contradicted by enough direct guest evidence.</motion.p>
        </div>

        {/* Before & After State Transition */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12 bg-slate-800/50 border border-slate-700 rounded-3xl p-8"
        >
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-6 text-center">State Transition — Before &amp; After AI Intervention</div>
          <div className="grid grid-cols-3 gap-4 items-center">

            {/* BEFORE */}
            <div className="flex flex-col items-center gap-4">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Before</div>
              <div className="w-full bg-slate-700/60 border border-slate-600 rounded-2xl p-5 flex flex-col items-center gap-3">
                <Database className="w-8 h-8 text-slate-400" />
                <div className="text-[10px] text-slate-500 font-mono">Listed hotel claim</div>
                <div className="flex items-center gap-2 bg-blue-500/20 border border-blue-500/40 rounded-xl px-4 py-2">
                  <span className="text-lg">🍳</span>
                  <span className="text-sm font-bold text-blue-300">Breakfast Included</span>
                  <span className="text-[10px] text-blue-300 font-mono ml-1">Listed</span>
                </div>
                <div className="text-[10px] text-slate-600 font-mono text-center">Recent direct confirmation is weak</div>
              </div>
            </div>

            {/* PROCESS */}
            <div className="flex flex-col items-center gap-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Process</div>
              <div className="flex flex-col items-center gap-2 w-full">
                <div className="p-3 bg-purple-500/20 border border-purple-500/30 rounded-2xl w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit className="w-4 h-4 text-purple-400" />
                    <span className="text-[10px] font-bold text-purple-300 uppercase">Guest signal collection</span>
                  </div>
                  <div className="space-y-1">
                    {['Breakfast was not included', 'We had to pay extra for breakfast', 'No breakfast came with the stay'].map((t, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.15 }}
                        className="text-[10px] text-slate-400 bg-slate-700/50 rounded px-2 py-1 font-mono"
                      >{t}</motion.div>
                    ))}
                  </div>
                </div>
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  transition={{ duration: 0.5, delay: 0.8 }}
                  className="w-full h-0.5 bg-gradient-to-r from-purple-500 to-amber-500 origin-left"
                />
                <div className="text-[10px] text-amber-400 font-mono text-center">{"contradicting direct guest signals reach threshold"}<br />{"→ listed claim becomes hidden until support returns"}</div>
              </div>
            </div>

            {/* AFTER */}
            <div className="flex flex-col items-center gap-4">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">After</div>
              <div className="w-full bg-slate-700/60 border border-slate-600 rounded-2xl p-5 flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-green-400" />
                <div className="text-[10px] text-slate-500 font-mono">Updated property state</div>
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-2">
                  <span className="text-lg opacity-40">🍳</span>
                  <span className="text-sm font-bold text-amber-300 line-through opacity-60">Breakfast Included</span>
                  <span className="text-[10px] text-amber-400 font-mono ml-1 font-bold">⚠ Hidden</span>
                </div>
                <div className="text-[10px] text-green-400 font-mono text-center bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5">
                  {"✓ Freshness state updated"}<br />{"claim visibility adjusted"}
                </div>
              </div>
            </div>

          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {[
            {
              step: "01",
              t: "Signal Collection",
              d: "Collects direct guest signals from submitted review text and structured follow-up answers, focusing on which hotel attributes were mentioned and how they were described.",
              icon: BrainCircuit
            },
            {
              step: "02",
              t: "Freshness Update",
              d: "Each new review can refresh last_mentioned_at, and each answered follow-up can refresh last_confirmed_at while updating avg_score with an EMA for scored attributes.",
              icon: Activity
            },
            {
              step: "03",
              t: "Claim Suppression",
              d: "Compares listed hotel claims against direct guest signals. When enough recent user evidence contradicts a listed claim, the claim can be hidden until supporting evidence returns.",
              icon: Cpu
            },
            {
              step: "04",
              t: "Closed-loop Refresh",
              d: "Freshness state, scored follow-up answers, and suppressed claims all feed back into future prioritization, helping PRISM ask better questions and show more trustworthy hotel information over time.",
              icon: Database
            }
          ].map((item, idx) => (
            <div key={idx} className="bg-slate-800/50 border border-slate-700 p-8 rounded-3xl relative z-10 backdrop-blur-sm">
              <div className="text-3xl font-black text-slate-700 mb-4">{item.step}</div>
              <item.icon className="w-8 h-8 text-blue-400 mb-5" />
              <h4 className="text-base font-semibold mb-3">{item.t}</h4>
              <p className="text-sm text-slate-400 leading-relaxed">{item.d}</p>
            </div>
          ))}
        </div>

          <div className="mt-16 flex flex-wrap justify-center gap-10 opacity-70">
          <div className="text-center">
            <div className="text-xl font-bold text-blue-400">Freshness</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">State Tracking</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-400">EMA</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Score Fusion Algorithm</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-purple-400">Suppression</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Claim Hygiene</div>
          </div>
        </div>
      </Section>

      {/* Slide 7: UI Intelligence */}
      <Section className="bg-white">
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="px-4 py-1 mb-5 inline-block rounded-full bg-blue-50 text-blue-700 text-xs font-semibold tracking-widest uppercase"
          >
            Product Design Layer
          </motion.div>
          <Title>UI Intelligence: Making Reviews Work For You</Title>
          <Subtitle>Complex algorithms made invisible — every tap you make, the system is working for you.</Subtitle>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

          {/* 1. Shared Tags */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="p-7 rounded-3xl border border-slate-200 bg-white shadow-sm flex flex-col gap-5"
          >
            <div>
              <Users className="w-7 h-7 text-blue-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">Shared Tags</h3>
              <p className="text-xs text-slate-500 leading-relaxed">Dynamic tag highlighting detects shared profile traits between you and a reviewer, helping users instantly identify reviews relevant to them.</p>
            </div>
            {/* UI mock */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <div className="text-[10px] text-slate-400 font-mono mb-3 uppercase">Your profile</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  { label: 'Business Traveler', match: true },
                  { label: 'Light Sleeper', match: true },
                  { label: 'Pet Owner', match: false },
                  { label: 'Foodie', match: false },
                ].map((tag, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-medium border ${
                      tag.match
                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    {tag.match && <span className="mr-1">✦</span>}{tag.label}
                  </motion.span>
                ))}
              </div>
              <div className="text-[10px] text-slate-400 font-mono mb-2 uppercase">Reviewer match</div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs text-blue-700 font-semibold">2 shared interests detected</span>
              </div>
            </div>
          </motion.div>

          {/* 2. Review Relevance */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="p-7 rounded-3xl border border-slate-200 bg-white shadow-sm flex flex-col gap-5"
          >
            <div>
              <Target className="w-7 h-7 text-blue-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">Review Relevance</h3>
              <p className="text-xs text-slate-500 leading-relaxed">Ranks reviews by exact shared tags and semantic cluster matches, using cached enrichment tags when available, and clearly labels the recommendation reason on each card.</p>
            </div>
            {/* UI mock */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
              {[
                { score: 96, label: 'Highly relevant to you', color: 'bg-blue-500', tag: 'Business Traveler' },
                { score: 72, label: 'Partially relevant', color: 'bg-amber-400', tag: 'Light Sleeper' },
                { score: 31, label: 'General review', color: 'bg-slate-300', tag: null },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.1 }}
                  className="bg-white rounded-xl p-3 border border-slate-100"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-slate-600">{item.label}</span>
                    <span className="text-[10px] font-black font-mono text-slate-700">{item.score}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${item.score}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
                      className={`h-full rounded-full ${item.color}`}
                    />
                  </div>
                  {item.tag && (
                    <span className="mt-1.5 inline-block text-[9px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{item.tag}</span>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* 3. AI Polish */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="p-7 rounded-3xl border border-slate-200 bg-white shadow-sm flex flex-col gap-5"
          >
            <div>
              <Zap className="w-7 h-7 text-blue-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">AI Polish</h3>
              <p className="text-xs text-slate-500 leading-relaxed">On-demand AI polishing rewrites rough notes into clearer review text without inventing new facts.</p>
            </div>
            {/* UI mock: before / after */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
              <div className="bg-white rounded-xl p-3 border border-slate-200">
                <div className="text-[9px] font-mono text-slate-400 mb-1.5 uppercase">Before</div>
                <p className="text-xs text-slate-500 leading-relaxed line-through opacity-60">&ldquo;The wifi was ok I guess, room was fine nothing special&rdquo;</p>
              </div>
              <div className="flex justify-center">
                <motion.div
                  animate={{ y: [0, 3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-blue-500 text-xs font-bold"
                >
                  ✦ AI Polished ↓
                </motion.div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                <div className="text-[9px] font-mono text-blue-500 mb-1.5 uppercase">After</div>
                <p className="text-xs text-slate-700 leading-relaxed">&ldquo;WiFi speed was adequate for video calls. Room was comfortable but lacked standout features.&rdquo;</p>
              </div>
            </div>
          </motion.div>

          {/* 4. Smart Follow-up UI */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="p-7 rounded-3xl border border-slate-200 bg-white shadow-sm flex flex-col gap-5"
          >
            <div>
              <MessageSquare className="w-7 h-7 text-blue-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">Smart Follow-up UI</h3>
              <p className="text-xs text-slate-500 leading-relaxed">Automatically generates 1–2 low-friction follow-up questions after submission. Answered via sliders or Yes / Neutral / No controls, with optional text and voice if needed.</p>
            </div>
            {/* UI mock */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
              <div className="text-[10px] text-slate-500 font-mono">How was the WiFi for work?</div>
              <div className="relative">
                <div className="w-full bg-slate-200 h-1.5 rounded-full" />
                <motion.div
                  initial={{ left: '20%' }}
                  whileInView={{ left: '72%' }}
                  transition={{ duration: 1, delay: 0.4, ease: 'easeOut' }}
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-600 rounded-full shadow border-2 border-white"
                  style={{ position: 'absolute' }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                <span>Unusable</span><span>Excellent</span>
              </div>
              <div className="pt-1 text-[10px] text-slate-500 font-mono">The WiFi felt stable enough for work.</div>
              <div className="grid grid-cols-3 gap-1.5">
                {['No', 'Neutral', 'Yes'].map((opt, i) => (
                  <motion.span
                    key={opt}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.07 }}
                    className={`text-[10px] px-2.5 py-2 rounded-full border text-center ${i === 2 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}
                  >
                    {opt}
                  </motion.span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* 5. Guided Drafting + Voice */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="p-7 rounded-3xl border border-slate-200 bg-white shadow-sm flex flex-col gap-5 md:col-span-2 xl:col-span-2"
          >
            <div>
              <Layers className="w-7 h-7 text-blue-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">Guided Drafting + Voice</h3>
              <p className="text-xs text-slate-500 leading-relaxed">Review drafting combines quick tags, prompt seeds, voice dictation, and optional AI polishing to lower the effort of writing useful feedback.</p>
            </div>
            {/* UI mock */}
            <div className="grid grid-cols-3 gap-3">
              {/* Quick tags */}
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-center">
                <span className="text-2xl">🏷️</span>
                <div className="text-[10px] font-semibold text-slate-500">Quick Tags</div>
                <div className="text-[9px] text-slate-400">Tap to insert<br/>WiFi, Breakfast, Noise</div>
                <div className="w-full bg-blue-100 rounded-full h-1 mt-1 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '75%' }}
                    transition={{ duration: 1, delay: 0.4 }}
                    className="h-full bg-blue-500 rounded-full"
                  />
                </div>
                <div className="text-[9px] text-blue-600 font-mono">8 ready</div>
              </div>
              {/* Prompt seeds */}
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-center">
                <span className="text-2xl">💬</span>
                <div className="text-[10px] font-semibold text-slate-500">Prompt Seeds</div>
                <div className="text-[9px] text-slate-400">Tap a question<br/>to prefill the draft</div>
                <div className="mt-1 flex gap-0.5">
                  {[3,5,4,6,3,5,4,3].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ scaleY: 0 }}
                      whileInView={{ scaleY: 1 }}
                      transition={{ delay: 0.5 + i * 0.05 }}
                      className="w-1 bg-amber-400 rounded-full origin-bottom"
                      style={{ height: h * 3 }}
                    />
                  ))}
                </div>
                <div className="text-[9px] text-amber-600 font-mono">6 prompts ready</div>
              </div>
              {/* Voice */}
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-center">
                <motion.span
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="text-2xl"
                >
                  🎙️
                </motion.span>
                <div className="text-[10px] font-semibold text-slate-500">Voice</div>
                <div className="text-[9px] text-slate-400">Tap to record<br/>dictation goes into the draft</div>
                <div className="mt-1 flex gap-0.5 items-end">
                  {[2,4,6,8,5,7,4,2].map((h, i) => (
                    <motion.div
                      key={i}
                      animate={{ scaleY: [1, 1.5, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.08 }}
                      className="w-1 bg-green-400 rounded-full origin-bottom"
                      style={{ height: h * 3 }}
                    />
                  ))}
                </div>
                <div className="text-[9px] text-green-600 font-mono">● Recording</div>
              </div>
            </div>
          </motion.div>

        </div>
      </Section>

      {/* Final slide — Know before you go */}
      <FinalSlide />

      {/* Footer */}
      <footer className="py-12 text-center text-slate-400 bg-white border-t border-slate-200 scroll-mt-0">
        <p className="text-sm italic tracking-widest uppercase">PRISM by PARC Group</p>
      </footer>
    </div>
  );
}
