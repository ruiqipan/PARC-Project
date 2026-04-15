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

// --- 可复用组件 ---

const Section = ({ children, className = "", id = "" }: { children: React.ReactNode, className?: string, id?: string }) => (
  <section id={id} className={`min-h-screen w-full flex flex-col items-center justify-center p-8 md:p-20 snap-start relative ${className}`}>
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
    className="text-5xl md:text-6xl font-bold mb-8 text-slate-900 tracking-tight text-center"
  >
    {children}
  </motion.h2>
);

const Subtitle = ({ children }: { children: React.ReactNode }) => (
  <motion.p
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay: 0.1 }}
    className="text-2xl md:text-3xl text-slate-500 mb-16 max-w-4xl mx-auto leading-relaxed text-center"
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
    <h3 className="text-xl font-bold mb-3">{title}</h3>
    <p className={`text-sm mb-4 ${highlight ? 'text-slate-400' : 'text-slate-500'}`}>{description}</p>
    {children}
  </motion.div>
);

// --- 衰减曲线图组件 ---
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

// Honeycomb: 3 cols × 4 rows, offset every other row, center column avoided mid-screen
// Each pill is wide + single-line so they read as thin elongated strips
const BACKGROUND_COMMENTS = [
  // Row 1  (y≈5%)  — full width, 3 pills
  { text: '"WiFi solid for video calls all day."',         tag: 'Business Traveler',  x: '2%',  y: '5%',  delay: 0.15 },
  { text: '"Quietest room I\'ve had in years."',           tag: 'Light Sleeper',       x: '34%', y: '5%',  delay: 0.30 },
  { text: '"Dog got treats at check-in — loved it."',      tag: 'Pet Owner',           x: '66%', y: '5%',  delay: 0.45 },
  // Row 2  (y≈20%) — offset, 2 pills (left + right)
  { text: '"Desk and chair were actually ergonomic."',     tag: 'Remote Worker',       x: '2%',  y: '20%', delay: 0.25 },
  { text: '"Ramp to entrance clearly marked."',            tag: 'Wheelchair User',     x: '72%', y: '20%', delay: 0.55 },
  // Row 3  (y≈35%) — 3 pills
  { text: '"Check-in at midnight, zero friction."',        tag: 'Late Arrival',        x: '2%',  y: '35%', delay: 0.20 },
  { text: '"Staff spoke Mandarin fluently."',              tag: 'International Guest', x: '72%', y: '35%', delay: 0.60 },
  // Row 4  (y≈65%) — offset, 2 pills
  { text: '"Pool open till 10pm — kids thrilled."',        tag: 'Family Traveler',     x: '2%',  y: '65%', delay: 0.35 },
  { text: '"Free parking, no stress on arrival."',         tag: 'Road Tripper',        x: '72%', y: '65%', delay: 0.50 },
  // Row 5  (y≈80%) — 3 pills
  { text: '"Gluten-free options at breakfast."',           tag: 'Dietary Needs',       x: '2%',  y: '82%', delay: 0.40 },
  { text: '"Spa booking was seamless via app."',           tag: 'Wellness Traveler',   x: '34%', y: '82%', delay: 0.65 },
  { text: '"Safety info was current and accurate."',       tag: 'Solo Traveler',       x: '66%', y: '82%', delay: 0.70 },
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
    <section ref={ref} className="min-h-screen w-full snap-start relative overflow-hidden bg-black flex items-center justify-center">
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
            animate={{ opacity: [0, 0.85, 0.75, 0.85], y: [6, 0, -4, 0] }}
            transition={{ opacity: { duration: 1.0, delay: c.delay }, y: { duration: 5, delay: c.delay, repeat: Infinity, ease: 'easeInOut' } }}
            className="absolute w-[230px]"
            style={{ left: c.x, top: c.y }}
          >
            <div className="bg-white/10 border border-white/22 backdrop-blur-sm rounded-full px-3.5 py-1.5 flex items-center gap-2">
              <span className="text-[8px] px-1.5 py-0.5 bg-blue-500/40 text-blue-200 rounded-full font-semibold whitespace-nowrap shrink-0">{c.tag}</span>
              <p className="text-white/80 text-[10px] italic truncate">{c.text}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Hotel card — blurry on load, sharpens, stays until Book Now */}
      <motion.div
        initial={{ filter: 'blur(20px)', opacity: 0 }}
        animate={cardControls}
        className="relative z-20 w-full max-w-sm mx-auto px-6"
      >
        <div className="bg-white/10 border border-white/20 backdrop-blur-md rounded-3xl p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-white font-bold text-lg">Omni Interlocken Hotel</div>
              <div className="text-white/50 text-sm">Broomfield, Colorado · ★ 4.6</div>
            </div>
            <div className="bg-green-500/20 border border-green-400/40 rounded-xl px-3 py-1.5 text-green-400 text-xs font-bold">
              Verified ✓
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
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
            className="w-full bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all text-white font-bold py-3.5 rounded-2xl text-base cursor-pointer"
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

// --- 主应用 ---

export default function PitchDeck() {
  return (
    <div className="bg-slate-50 font-sans selection:bg-blue-100 selection:text-blue-900 h-screen overflow-y-auto snap-y snap-mandatory">

      {/* 🎬 Slide 0: Opening / System Identity */}
      <section className="min-h-screen w-full flex items-center justify-center snap-start relative overflow-hidden bg-black">
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

      {/* Slide 1: Algorithm Core Overview */}
      <Section className="bg-white">
        <div className="text-center mb-16">
          <motion.div className="px-4 py-1 mb-6 inline-block rounded-full bg-blue-50 text-blue-700 text-xs font-bold tracking-widest uppercase">
            核心算法架构
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-5xl font-bold mb-6 text-slate-900 tracking-tight"
          >
            双引擎算法闭环系统
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-xl md:text-2xl text-slate-500 mb-12 max-w-3xl mx-auto leading-relaxed"
          >
            PRISM 的核心由两个相互协作的算法引擎组成：一个负责高效"索取"信息，另一个负责精炼"反哺"知识。
          </motion.p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card
            title="引擎 A: 智能追问算法"
            description="Focus: 如何以最小的用户负担，获取最高价值的缺失信息补丁。"
            icon={MessageSquare}
          >
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">衰减检测</span>
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">盲点识别</span>
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">决策匹配</span>
            </div>
          </Card>
          <Card
            title="引擎 B: 平台更新算法"
            description="Focus: 如何将碎片化的用户反馈，沉淀为经过滤噪后的属性资产。"
            icon={RefreshCw}
          >
            <div className="mt-4 flex flex-wrap gap-2 text-slate-500">
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">特征提取</span>
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">置信度评估</span>
              <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded">图谱更新</span>
            </div>
          </Card>
        </div>
      </Section>

      {/* Slide 2: 信息健康度检测 */}
      <Section className="bg-slate-50">
        <div className="text-center mb-16">
          <motion.div className="text-blue-600 font-extrabold mb-4 uppercase tracking-widest text-lg">引擎 A - 属性角度 (检测层)</motion.div>
          <Title>信息健康度检测：属性维度的"全能体检"</Title>
          <Subtitle>系统在天亮扫描属性知识库，识别哪些地方需要"外部信息补给"。</Subtitle>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col p-10 rounded-[2.5rem] bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <TrendingDown className="text-red-500 w-12 h-12 mb-8" />
            <div>
              <h4 className="text-2xl md:text-3xl font-bold text-slate-900 mb-6 leading-tight">① 信息衰减<br/><span className="text-slate-400 font-medium text-xl">(Decay-aware signals)</span></h4>
              <div className="text-lg md:text-xl text-slate-500 leading-relaxed space-y-4">
                <p>• 每个属性层都有一条 <span className="text-slate-900 font-semibold">decay curve</span></p>
                <p>• 不同 <span className="text-blue-600 font-semibold">Feature</span> 有最优更新频次不同</p>
                <div className="pt-6 border-t border-slate-100">
                  <span className="font-bold text-slate-900">核心功能：识别过时信息</span>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col p-10 rounded-[2.5rem] bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <Search className="text-blue-500 w-12 h-12 mb-8" />
            <div>
              <h4 className="text-2xl md:text-3xl font-bold text-slate-900 mb-6 leading-tight">② 信息缺失<br/><span className="text-slate-400 font-medium text-xl">(Missing Information)</span></h4>
              <div className="text-lg md:text-xl text-slate-500 leading-relaxed space-y-4">
                <p>• 官方描述中存在但<span className="text-slate-900 font-semibold">未被用户验证</span>的信息</p>
                <p>• 跨属性<span className="text-blue-600 font-semibold">常见通用属性</span>的缺位</p>
                <div className="pt-6 border-t border-slate-100">
                  <span className="font-bold text-slate-900">核心功能：识别 should-exist 的信息空白</span>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col p-10 rounded-[2.5rem] bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <AlertCircle className="text-amber-500 w-12 h-12 mb-8" />
            <div>
              <h4 className="text-2xl md:text-3xl font-bold text-slate-900 mb-6 leading-tight">③ 未验证盲点修复<br/><span className="text-slate-400 font-medium text-xl">(Mismatch Detection)</span></h4>
              <div className="text-lg md:text-xl text-slate-500 leading-relaxed space-y-4">
                <p>• 对比<span className="text-slate-900 font-semibold">官方描述 vs 用户评论</span></p>
                <p>• 识别长期被忽视的信息盲区</p>
                <div className="pt-6 border-t border-slate-100">
                  <span className="font-bold text-slate-900">核心功能：补全属性缺失的普遍必备项</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* Slide 3: 信息新鲜度计算引擎 */}
      <Section className="bg-slate-50">
        <div className="text-center mb-12">
          <motion.div className="text-blue-600 font-extrabold mb-4 uppercase tracking-widest text-lg">Freshness Calculation Architecture</motion.div>
          <Title>信息新鲜度如何被计算？</Title>
          <Subtitle>PRISM 如何判断"哪些信息过时，下一步问什么问题"的底层实现</Subtitle>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch relative">

          <div className="flex flex-col p-8 rounded-[2rem] bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-red-50 rounded-xl"><Clock className="text-red-500" /></div>
              <h4 className="text-xl font-bold text-slate-900">第一层: 衰减曲线<br/><span className="text-xs font-mono text-slate-400 font-normal">Property Memory Decay Engine</span></h4>
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
              <h4 className="text-xl font-bold text-slate-900">第二层: 重要性权重<br/><span className="text-xs font-mono text-slate-400 font-normal">Decision Risk Minimization</span></h4>
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
              <h4 className="text-xl font-bold text-slate-900">第三层: 最终紧急度评分<br/><span className="text-xs font-mono text-slate-400 font-normal">Follow-up Prioritization Engine</span></h4>
            </div>

            <div className="space-y-4 pt-4">
              <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center justify-between animate-pulse">
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Current Top Priority</div>
                  <div className="text-lg font-bold text-slate-900">Safety <span className="text-xs font-normal text-red-500">(STALE)</span></div>
                </div>
                <div className="text-2xl font-black text-red-500 font-mono">9.8</div>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase">High Priority</div>
                  <div className="text-lg font-bold text-slate-900">Wifi <span className="text-xs font-normal text-yellow-500">(STALE)</span></div>
                </div>
                <div className="text-2xl font-black text-yellow-500 font-mono">7.2</div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between opacity-60">
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Low Priority</div>
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
                Formula: risk_weight × staleness × persona_multiplier
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

      {/* Slide 4: 智能追问匹配 */}
      <Section className="bg-white">
        <div className="text-center mb-16">
          <motion.div className="text-blue-600 font-bold mb-2 uppercase tracking-wide">引擎 A - 用户角度 (匹配层)</motion.div>
          <motion.h2 className="text-4xl md:text-5xl font-bold mb-6 text-slate-900 tracking-tight">智能追问匹配：找到对的人问对的话</motion.h2>
          <motion.p className="text-xl md:text-2xl text-slate-500 mb-12 max-w-3xl mx-auto leading-relaxed text-center">在识别到"问题"后，我们需要决定在哪个时刻、向哪个用户抛出 1—2 个问题。</motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <Card title="决策风险排序" icon={BarChart3} description="系统优先追问对未来用户决策影响最大（Decision Impact）的因素。如果噪音问题是该类属性的痛点，则其优先级高于软装细节。">
            <div className="text-[10px] text-slate-400 mt-4 border-t pt-4">Impact = Variance × Decision Weight</div>
          </Card>
          <Card title="用户相关度匹配" icon={Users} description="通过语义分析用户已填写的评论内容，判断其的实际体验边界。只向刚经历相关场景（如：游泳、早餐）的用户发起对应追问。">
            <div className="text-[10px] text-slate-400 mt-4 border-t pt-4">User Relevance Scoring Engine</div>
          </Card>
          <Card title="低成本交互设计" icon={Zap} description="避免强制用户输入文字，采用滑动条（Likert Scale）、多选确认或粘贴标签。操作成本最低，核心是：识别而非回忆。">
            <div className="text-[10px] text-slate-400 mt-4 border-t pt-4">Recognition {'>'} Recall Principle</div>
          </Card>
        </div>

        <div className="bg-blue-50 p-10 rounded-[2.5rem] border border-blue-100 relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1">
              <h4 className="text-2xl font-bold text-slate-900 mb-4">匹配示例 (Matching Logic)</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="text-green-500 w-4 h-4" /> 待填任务：泳池 水温是否为恒温？
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="text-green-500 w-4 h-4" /> 用户 Review 关键词："带小孩玩水"、"洗衣室干净"
                </div>
                <div className="flex items-center gap-2 text-sm font-bold text-blue-600">
                  <ArrowRightLeft className="w-4 h-4" /> 触发追问（只需 1 秒点击）：告诉我们水温如何？
                </div>
              </div>
            </div>
            <div className="w-full md:w-64 bg-white p-6 rounded-2xl shadow-lg border border-blue-200">
               <p className="text-xs font-bold text-slate-400 mb-3 uppercase">用户侧的前端显示</p>
               <p className="text-sm font-medium mb-4">水温让您感到舒适吗？</p>
               <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                 <span>否</span>
                 <span>是</span>
               </div>
               <div className="w-full h-1 bg-slate-100 rounded-full relative">
                 <div className="absolute top-1/2 left-3/4 -translate-y-1/2 w-4 h-4 bg-blue-600 rounded-full shadow-md border-2 border-white"></div>
               </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Slide 5: 知识更新引擎 */}
      <Section className="bg-slate-900 text-white">
        <div className="mb-12 text-center">
          <motion.div className="text-blue-400 font-bold mb-2 uppercase tracking-wide">引擎 B - 知识反哺层</motion.div>
          <motion.h2 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">知识更新引擎：从碎片答案到资产</motion.h2>
          <motion.p className="text-xl md:text-2xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed">当用户完成那 1 秒钟的点击，算法引擎开始执行"反哺"流程，完成知识闭环。</motion.p>
        </div>

        {/* Before & After 状态变迁图 */}
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
                <div className="text-[10px] text-slate-500 font-mono">静态知识库</div>
                <div className="flex items-center gap-2 bg-blue-500/20 border border-blue-500/40 rounded-xl px-4 py-2">
                  <span className="text-lg">🏊</span>
                  <span className="text-sm font-bold text-blue-300">游泳池</span>
                  <span className="text-[10px] text-green-400 font-mono ml-1">✓ 已验证</span>
                </div>
                <div className="text-[10px] text-slate-600 font-mono text-center">last_mentioned: 180d ago<br/>avg_score: —</div>
              </div>
            </div>

            {/* PROCESS */}
            <div className="flex flex-col items-center gap-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Process</div>
              <div className="flex flex-col items-center gap-2 w-full">
                <div className="p-3 bg-purple-500/20 border border-purple-500/30 rounded-2xl w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit className="w-4 h-4 text-purple-400" />
                    <span className="text-[10px] font-bold text-purple-300 uppercase">LLM 扫描评论</span>
                  </div>
                  <div className="space-y-1">
                    {['「泳池这周没开」', '「维修中无法使用」', '「游泳池关闭了」'].map((t, i) => (
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
                <div className="text-[10px] text-amber-400 font-mono text-center">{"staleness > 半衰期阈值"}<br />{"→ 触发置信度重评估"}</div>
              </div>
            </div>

            {/* AFTER */}
            <div className="flex flex-col items-center gap-4">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">After</div>
              <div className="w-full bg-slate-700/60 border border-slate-600 rounded-2xl p-5 flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-green-400" />
                <div className="text-[10px] text-slate-500 font-mono">实时更新画像</div>
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-2">
                  <span className="text-lg opacity-40">🏊</span>
                  <span className="text-sm font-bold text-amber-300 line-through opacity-60">游泳池</span>
                  <span className="text-[10px] text-amber-400 font-mono ml-1 font-bold">⚠ 待确认</span>
                </div>
                <div className="text-[10px] text-green-400 font-mono text-center bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5">
                  {"✓ 属性已更新"}<br />{"avg_score → 1.8 ↓"}
                </div>
              </div>
            </div>

          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {[
            {
              step: "01",
              t: "语义挖掘 (Semantic Mining)",
              d: "集成 LLM 对评论进行异步批量分析，通过关键词锚定将原始文本映射到具体酒店属性，提取每个维度的真实用户反馈信号。",
              icon: BrainCircuit
            },
            {
              step: "02",
              t: "阈值触发 (Threshold Trigger)",
              d: "每条新评论提交后实时更新属性的 last_mentioned_at 时间戳，结合指数衰减曲线计算 staleness 值，超出半衰期即触发置信度重评估。",
              icon: Activity
            },
            {
              step: "03",
              t: "冲突消解 (Conflict Resolution)",
              d: "对比酒店官方 Description 与用户评论的属性覆盖情况，识别「官方声称存在但评论从未提及」的盲点，作为追问优先级的重要权重。",
              icon: Cpu
            },
            {
              step: "04",
              t: "闭环更新 (Closed-loop Update)",
              d: "用户追问回答通过 EMA 算法（new = old×0.6 + answer×0.4）持续更新属性的 avg_score，推动酒店画像从静态展示向数据驱动的实时更新闭环演进。",
              icon: Database
            }
          ].map((item, idx) => (
            <div key={idx} className="bg-slate-800/50 border border-slate-700 p-8 rounded-3xl relative z-10 backdrop-blur-sm">
              <div className="text-4xl font-black text-slate-700 mb-4">{item.step}</div>
              <item.icon className="w-10 h-10 text-blue-400 mb-6" />
              <h4 className="text-xl font-bold mb-3">{item.t}</h4>
              <p className="text-sm text-slate-400 leading-relaxed">{item.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap justify-center gap-10 opacity-70">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">实时</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">新鲜度更新</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">EMA</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">评分融合算法</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">闭环</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">知识反哺机制</div>
          </div>
        </div>
      </Section>

      {/* Slide 6: UI Intelligence */}
      <Section className="bg-white">
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="px-4 py-1 mb-6 inline-block rounded-full bg-blue-50 text-blue-700 text-xs font-bold tracking-widest uppercase"
          >
            产品化设计层
          </motion.div>
          <Title>UI Intelligence: Making Reviews Work For You</Title>
          <Subtitle>将复杂算法转化为无感用户体验——每一次点击背后，都有系统在为你工作。</Subtitle>
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
              <p className="text-xs text-slate-500 leading-relaxed">首页标签动态高亮与评论者的共同画像，帮助用户秒识"和我相关"的评论。</p>
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
              <p className="text-xs text-slate-500 leading-relaxed">通过画像匹配对评论相关性排序，在卡片上明确标注推荐原因。</p>
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
              <p className="text-xs text-slate-500 leading-relaxed">实时语言优化建议，让用户评论更清晰、更有参考价值。</p>
            </div>
            {/* UI mock: before / after */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
              <div className="bg-white rounded-xl p-3 border border-slate-200">
                <div className="text-[9px] font-mono text-slate-400 mb-1.5 uppercase">Before</div>
                <p className="text-xs text-slate-500 leading-relaxed line-through opacity-60">"The wifi was ok I guess, room was fine nothing special"</p>
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
                <p className="text-xs text-slate-700 leading-relaxed">"WiFi speed was adequate for video calls. Room was comfortable but lacked standout features."</p>
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
              <p className="text-xs text-slate-500 leading-relaxed">提交后自动生成 1–2 个低摩擦追问，滑块与标签完成作答，无需打字。</p>
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
              <div className="pt-1 text-[10px] text-slate-500 font-mono">What was the main noise source?</div>
              <div className="flex flex-wrap gap-1.5">
                {['Street traffic', 'AC / heating', 'Hallway', 'It was quiet'].map((opt, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.07 }}
                    className={`text-[10px] px-2.5 py-1 rounded-full border cursor-pointer ${i === 3 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}
                  >
                    {opt}
                  </motion.span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* 5. Multi-modal Input */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="p-7 rounded-3xl border border-slate-200 bg-white shadow-sm flex flex-col gap-5 md:col-span-2 xl:col-span-2"
          >
            <div>
              <Layers className="w-7 h-7 text-blue-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">Multi-modal Input</h3>
              <p className="text-xs text-slate-500 leading-relaxed">评论支持图片、视频与语音输入，拖拽上传或一键录音，系统自动转录并提取属性信号。</p>
            </div>
            {/* UI mock */}
            <div className="grid grid-cols-3 gap-3">
              {/* Photo upload */}
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-center">
                <span className="text-2xl">🖼️</span>
                <div className="text-[10px] font-semibold text-slate-500">Photo</div>
                <div className="text-[9px] text-slate-400">Drag & drop<br/>or tap to upload</div>
                <div className="w-full bg-blue-100 rounded-full h-1 mt-1 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '75%' }}
                    transition={{ duration: 1, delay: 0.4 }}
                    className="h-full bg-blue-500 rounded-full"
                  />
                </div>
                <div className="text-[9px] text-blue-600 font-mono">3 uploaded</div>
              </div>
              {/* Video */}
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-center">
                <span className="text-2xl">🎬</span>
                <div className="text-[10px] font-semibold text-slate-500">Video</div>
                <div className="text-[9px] text-slate-400">Up to 60s<br/>auto-transcribed</div>
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
                <div className="text-[9px] text-amber-600 font-mono">Transcribing…</div>
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
                <div className="text-[9px] text-slate-400">Tap to record<br/>NLP auto-tags</div>
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

      {/* Slide 7: From Reviews to Reliable Reality — cinematic narrative */}
      <section className="min-h-screen w-full flex flex-col items-center justify-center snap-start relative overflow-hidden bg-black">
        {/* Background: aerial city nightscape */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=80')` }}
        >
          <div className="absolute inset-0 bg-black/65" />
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
            className="text-blue-400 font-bold uppercase tracking-widest text-xs mb-8"
          >
            Property Knowledge Engine
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold text-white mb-8 tracking-tight leading-tight"
          >
            From Reviews<br />to Reliable Reality
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="text-xl md:text-2xl text-white/60 mb-16 max-w-3xl mx-auto leading-relaxed"
          >
            让评论不只是表达，而是成为一个持续校准现实的系统。
          </motion.p>

          {/* Three narrative pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {[
              {
                icon: '🔍',
                title: '识别缺失与衰减',
                body: '系统持续监测每个属性的信息健康度，在数据腐化前主动触发补全流程。',
              },
              {
                icon: '🎯',
                title: '精准路由问题',
                body: '将最小成本的追问，精准路由给最合适的用户——只问对的人、只问对的事。',
              },
              {
                icon: '🔄',
                title: '答案结构化反哺',
                body: '每一条回答都被转化为结构化、可更新的决策信息，驱动知识库持续进化。',
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 + i * 0.12 }}
                className="bg-white/8 border border-white/15 backdrop-blur-sm rounded-3xl p-6"
              >
                <div className="text-3xl mb-4">{item.icon}</div>
                <h4 className="text-white font-bold mb-2 text-base">{item.title}</h4>
                <p className="text-white/55 text-sm leading-relaxed">{item.body}</p>
              </motion.div>
            ))}
          </div>

          {/* Ecosystem loop visual */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="mt-14 flex items-center justify-center gap-3 flex-wrap"
          >
            {['评论', '→', '追问', '→', '答案', '→', '结构化数据', '→', '更好的决策'].map((item, i) => (
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

      {/* Slide 8: Final — Know before you go */}
      <FinalSlide />

      {/* Footer */}
      <footer className="py-12 text-center text-slate-400 bg-white border-t border-slate-200 snap-start">
        <p className="text-sm italic tracking-widest uppercase">PRISM by PARC Group</p>
      </footer>
    </div>
  );
}
