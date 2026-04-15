'use client';

import React from 'react';
import { motion } from 'framer-motion';
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

// ─── Reusable Components ───────────────────────────────────────────────────────

const Section = ({
  children,
  className = "",
  id = "",
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) => (
  <section
    id={id}
    className={`min-h-screen w-full flex flex-col items-center justify-center p-8 md:p-20 snap-start relative ${className}`}
  >
    <div className="max-w-7xl w-full relative z-10">{children}</div>
  </section>
);

const MonoLabel = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    transition={{ duration: 0.5 }}
    className={`text-xs font-semibold mb-5 uppercase text-blue-400 ${className}`}
    style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.18em' }}
  >
    {children}
  </motion.div>
);

const Title = ({ children }: { children: React.ReactNode }) => (
  <motion.h2
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6 }}
    className="text-5xl md:text-6xl font-bold mb-6 text-white text-center"
    style={{ fontFamily: "'Manrope', sans-serif", letterSpacing: '-0.025em' }}
  >
    {children}
  </motion.h2>
);

const Subtitle = ({ children }: { children: React.ReactNode }) => (
  <motion.p
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay: 0.1 }}
    className="text-lg md:text-xl text-slate-400 mb-14 max-w-4xl mx-auto leading-relaxed text-center"
    style={{ fontFamily: "'Inter', sans-serif" }}
  >
    {children}
  </motion.p>
);

const Card = ({
  title,
  icon: Icon,
  description,
  delay = 0,
  highlight = false,
  children,
}: {
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
    className={`p-8 rounded-[2rem] border h-full ${
      highlight
        ? 'bg-[#1E293B] border-blue-500/30 shadow-lg shadow-blue-500/5'
        : 'bg-[#1E293B] border-slate-700/50'
    }`}
  >
    {Icon && <Icon className="w-8 h-8 mb-6 text-blue-400" />}
    <h3
      className="text-lg font-bold mb-3 text-white"
      style={{ fontFamily: "'Manrope', sans-serif" }}
    >
      {title}
    </h3>
    <p
      className="text-sm mb-4 text-slate-400 leading-relaxed"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {description}
    </p>
    {children}
  </motion.div>
);

// ─── Decay Chart ───────────────────────────────────────────────────────────────

const DecayChart = () => {
  const curves = [
    { label: 'Cleanliness', halfLife: 7, color: '#EF4444' },
    { label: 'Wifi/Parking', halfLife: 30, color: '#60A5FA' },
    { label: 'Pet Policy/Safety', halfLife: 90, color: '#F59E0B' },
    { label: 'Transit', halfLife: 365, color: '#10B981' },
  ];

  const generatePath = (halfLife: number) => {
    const k = Math.log(2) / halfLife;
    let path = 'M 0 0';
    for (let t = 0; t <= 365; t += 5) {
      const y = 200 * (1 - Math.exp(-k * t));
      path += ` L ${t} ${y}`;
    }
    return path;
  };

  return (
    <div className="bg-[#111827] p-6 rounded-2xl border border-slate-700/40 relative h-64 w-full">
      <div
        className="absolute top-2 left-4 text-[9px] text-slate-600 uppercase tracking-widest"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        Staleness Index (0 → 1.0)
      </div>
      <svg viewBox="0 0 365 200" className="w-full h-full overflow-visible">
        <line x1="0" y1="0" x2="365" y2="0" stroke="#1E293B" strokeWidth="1" />
        <line x1="0" y1="200" x2="365" y2="200" stroke="#1E293B" strokeWidth="1" />
        {curves.map((c, i) => (
          <motion.path
            key={i}
            d={generatePath(c.halfLife)}
            fill="none"
            stroke={c.color}
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            transition={{ duration: 1.5, delay: i * 0.2 }}
          />
        ))}
      </svg>
      <div
        className="flex justify-between mt-2 text-[9px] text-slate-600"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        <span>DAY 0</span>
        <span>DAY 180</span>
        <span>DAY 365 (TIME AXIS)</span>
      </div>
    </div>
  );
};

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function PitchDeck() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <div
        className="bg-[#0F172A] h-screen overflow-y-auto snap-y snap-mandatory selection:bg-blue-900/40 selection:text-blue-200"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >

        {/* ── Slide 0: Hero ────────────────────────────────────────────────── */}
        <section className="min-h-screen w-full flex items-center justify-center snap-start relative overflow-hidden bg-[#0B1F3A]">
          <div
            className="absolute inset-0 z-0 bg-cover bg-center"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1920&q=80')`,
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(11,31,58,0.82) 0%, rgba(11,31,58,0.68) 100%)',
              }}
            />
          </div>

          <div className="relative z-10 text-center px-6">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="text-6xl md:text-9xl font-extrabold text-white mb-5 drop-shadow-[0_4px_32px_rgba(0,0,0,0.5)]"
              style={{ fontFamily: "'Manrope', sans-serif", letterSpacing: '-0.04em' }}
            >
              PRISM
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.25 }}
              className="text-sm md:text-base text-white/50 mb-12 tracking-[0.2em] uppercase font-light"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              Property Review Intelligence &amp; Staleness Management
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.45 }}
              className="max-w-xl mx-auto border-t border-white/10 pt-8"
            >
              <p
                className="text-sm md:text-base text-white/40 leading-loose italic"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                &ldquo;Reviews are not static text — they are signals that continuously reshape
                what we know about a place.&rdquo;
              </p>
            </motion.div>

            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity, delay: 1.5 }}
              className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/20"
            >
              <ChevronDown className="w-7 h-7" />
            </motion.div>
          </div>
        </section>

        {/* ── Slide 1: Algorithm Core ──────────────────────────────────────── */}
        <Section className="bg-[#0F172A]">
          <div className="text-center mb-16">
            <MonoLabel>核心算法架构</MonoLabel>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-4xl md:text-5xl font-bold mb-5 text-white"
              style={{ fontFamily: "'Manrope', sans-serif", letterSpacing: '-0.025em' }}
            >
              双引擎算法闭环系统
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-lg md:text-xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              PARC 的核心由两个相互协作的算法引擎组成：一个负责高效"索取"信息，另一个负责精炼"反哺"知识。
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card
              title="引擎 A: 智能追问算法"
              description="Focus: 如何以最小的用户负担，获取最高价值的缺失信息补丁。"
              icon={MessageSquare}
              highlight
            >
              <div className="mt-5 flex flex-wrap gap-2">
                {['衰减检测', '盲点识别', '决策匹配'].map((tag) => (
                  <span
                    key={tag}
                    className="bg-blue-500/15 text-blue-400 border border-blue-500/20 text-[10px] px-2.5 py-1 rounded-full"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Card>
            <Card
              title="引擎 B: 平台更新算法"
              description="Focus: 如何将碎片化的用户反馈，沉淀为经过滤噪后的属性资产。"
              icon={RefreshCw}
            >
              <div className="mt-5 flex flex-wrap gap-2">
                {['特征提取', '置信度评估', '图谱更新'].map((tag) => (
                  <span
                    key={tag}
                    className="bg-blue-500/15 text-blue-400 border border-blue-500/20 text-[10px] px-2.5 py-1 rounded-full"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Card>
          </div>
        </Section>

        {/* ── Slide 2: 信息健康度检测 ─────────────────────────────────────── */}
        <Section className="bg-[#0F172A]">
          <div className="text-center mb-14">
            <MonoLabel>引擎 A — 属性角度 / 检测层</MonoLabel>
            <Title>信息健康度检测：属性维度的"全能体检"</Title>
            <Subtitle>系统在天亮扫描属性知识库，识别哪些地方需要"外部信息补给"。</Subtitle>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: TrendingDown,
                iconColor: 'text-red-400',
                title: '① 信息衰减',
                label: 'Decay-aware Signals',
                body: [
                  <>• 每个属性层都有一条 <span className="text-white font-medium">decay curve</span></>,
                  <>• 不同 <span className="text-blue-400 font-medium">Feature</span> 有最优更新频次不同</>,
                ],
                cta: '核心功能：识别过时信息',
                delay: 0.1,
              },
              {
                icon: Search,
                iconColor: 'text-blue-400',
                title: '② 信息缺失',
                label: 'Missing Information',
                body: [
                  <>• 官方描述中存在但<span className="text-white font-medium">未被用户验证</span>的信息</>,
                  <>• 跨属性<span className="text-blue-400 font-medium">常见通用属性</span>的缺位</>,
                ],
                cta: '核心功能：识别 should-exist 的信息空白',
                delay: 0.2,
              },
              {
                icon: AlertCircle,
                iconColor: 'text-amber-400',
                title: '③ 未验证盲点修复',
                label: 'Mismatch Detection',
                body: [
                  <>• 对比<span className="text-white font-medium">官方描述 vs 用户评论</span></>,
                  <>• 识别长期被忽视的信息盲区</>,
                ],
                cta: '核心功能：补全属性缺失的普遍必备项',
                delay: 0.3,
              },
            ].map(({ icon: Icon, iconColor, title, label, body, cta, delay }) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay }}
                className="flex flex-col p-9 rounded-[2rem] bg-[#1E293B] border border-slate-700/50 hover:border-slate-600/60 transition-colors"
              >
                <Icon className={`${iconColor} w-10 h-10 mb-7`} />
                <div>
                  <h4
                    className="text-xl md:text-2xl font-bold text-white mb-1.5 leading-tight"
                    style={{ fontFamily: "'Manrope', sans-serif" }}
                  >
                    {title}
                  </h4>
                  <p
                    className="text-[10px] text-slate-500 mb-5"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {label}
                  </p>
                  <div
                    className="text-sm text-slate-400 leading-relaxed space-y-3"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    {body.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                    <div className="pt-5 border-t border-slate-700/50 mt-2">
                      <span className="font-semibold text-white text-sm">{cta}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* ── Slide 3: 信息新鲜度计算引擎 ─────────────────────────────────── */}
        <Section className="bg-[#0F172A]">
          <div className="text-center mb-12">
            <MonoLabel>Freshness Calculation Architecture</MonoLabel>
            <Title>信息新鲜度如何被计算？</Title>
            <Subtitle>PARC 如何判断"哪些信息过时，下一步问什么问题"的底层实现</Subtitle>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch relative">

            {/* Layer 1: Decay Curve */}
            <div className="flex flex-col p-8 rounded-[2rem] bg-[#1E293B] border border-slate-700/50">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-red-500/10 rounded-xl">
                  <Clock className="text-red-400 w-5 h-5" />
                </div>
                <div>
                  <h4
                    className="text-base font-bold text-white"
                    style={{ fontFamily: "'Manrope', sans-serif" }}
                  >
                    第一层: 衰减曲线
                  </h4>
                  <p
                    className="text-[10px] text-slate-500 mt-0.5"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    Property Memory Decay Engine
                  </p>
                </div>
              </div>
              <DecayChart />
              <div className="mt-5 space-y-2.5">
                {[
                  { label: 'Cleanliness / Construction', value: '7 Days', color: 'text-red-400' },
                  { label: 'Wifi / Parking', value: '30 Days', color: 'text-blue-400' },
                  { label: 'Safety / Accessibility', value: '90–180 Days', color: 'text-amber-400' },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between items-center text-xs border-b border-slate-700/40 pb-2"
                  >
                    <span
                      className="text-slate-500"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      {row.label}
                    </span>
                    <span
                      className={`${row.color} font-semibold`}
                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Layer 2: Importance Weights */}
            <div className="flex flex-col p-8 rounded-[2rem] bg-[#1E293B] border border-slate-700/50">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-blue-500/10 rounded-xl">
                  <ShieldCheck className="text-blue-400 w-5 h-5" />
                </div>
                <div>
                  <h4
                    className="text-base font-bold text-white"
                    style={{ fontFamily: "'Manrope', sans-serif" }}
                  >
                    第二层: 重要性权重
                  </h4>
                  <p
                    className="text-[10px] text-slate-500 mt-0.5"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    Decision Risk Minimization
                  </p>
                </div>
              </div>
              <div className="flex-grow space-y-3 pt-2">
                {[
                  { l: 'Safety', w: 10, c: '#EF4444' },
                  { l: 'Check-in', w: 9, c: '#F87171' },
                  { l: 'Pet/Cleanliness', w: 8, c: '#FB923C' },
                  { l: 'Wifi/Construction', w: 7, c: '#FBBF24' },
                  { l: 'Breakfast', w: 5, c: '#475569' },
                  { l: 'Pool/Gym', w: 3, c: '#334155' },
                ].map((item, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span style={{ fontFamily: "'Inter', sans-serif" }}>{item.l}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                        Weight: {item.w}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
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

            {/* Layer 3: Urgency Score */}
            <div className="flex flex-col p-8 rounded-[2rem] bg-[#0B1F3A] border border-blue-500/20 text-white shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/8 blur-[80px] group-hover:bg-blue-500/15 transition-all duration-700" />
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-blue-500/15 rounded-xl">
                  <Zap className="text-blue-400 w-5 h-5" />
                </div>
                <div>
                  <h4
                    className="text-base font-bold text-white"
                    style={{ fontFamily: "'Manrope', sans-serif" }}
                  >
                    第三层: 最终紧急度评分
                  </h4>
                  <p
                    className="text-[10px] text-slate-500 mt-0.5"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    Follow-up Prioritization Engine
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="p-4 bg-white/4 rounded-2xl border border-red-500/20 flex items-center justify-between animate-pulse">
                  <div>
                    <div
                      className="text-[9px] text-slate-500 uppercase tracking-widest mb-1"
                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      Current Top Priority
                    </div>
                    <div
                      className="text-base font-bold text-white"
                      style={{ fontFamily: "'Manrope', sans-serif" }}
                    >
                      Safety{' '}
                      <span
                        className="text-xs font-normal text-red-400"
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        (STALE)
                      </span>
                    </div>
                  </div>
                  <div
                    className="text-2xl font-black text-red-400"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    9.8
                  </div>
                </div>

                <div className="p-4 bg-white/4 rounded-2xl border border-white/8 flex items-center justify-between">
                  <div>
                    <div
                      className="text-[9px] text-slate-500 uppercase tracking-widest mb-1"
                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      High Priority
                    </div>
                    <div
                      className="text-base font-bold text-white"
                      style={{ fontFamily: "'Manrope', sans-serif" }}
                    >
                      Wifi{' '}
                      <span
                        className="text-xs font-normal text-amber-400"
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        (STALE)
                      </span>
                    </div>
                  </div>
                  <div
                    className="text-2xl font-black text-amber-400"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    7.2
                  </div>
                </div>

                <div className="p-4 bg-white/4 rounded-2xl border border-white/8 flex items-center justify-between opacity-40">
                  <div>
                    <div
                      className="text-[9px] text-slate-500 uppercase tracking-widest mb-1"
                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      Low Priority
                    </div>
                    <div
                      className="text-base font-bold text-white"
                      style={{ fontFamily: "'Manrope', sans-serif" }}
                    >
                      Gym{' '}
                      <span
                        className="text-xs font-normal text-blue-400"
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        (STALE)
                      </span>
                    </div>
                  </div>
                  <div
                    className="text-2xl font-black text-blue-400"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    1.5
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-7">
                <div
                  className="p-3.5 rounded-xl bg-blue-600 text-center font-semibold text-sm flex items-center justify-center gap-2"
                  style={{ fontFamily: "'Manrope', sans-serif" }}
                >
                  <Zap className="w-4 h-4" /> Triggering Follow-up Questions
                </div>
                <div
                  className="mt-3 text-[9px] text-slate-600 text-center"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Formula: risk_weight × staleness × persona_multiplier
                </div>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex justify-center mt-10 gap-20 items-center">
            {[
              ['Decay Curve', 'Importance'],
              ['Importance', 'Urgency Score'],
            ].map(([from, to], i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-slate-700 text-[10px] uppercase tracking-widest"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <span>{from}</span>
                <ArrowRightLeft className="w-3 h-3" />
                <span>{to}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Slide 4: 智能追问匹配 ────────────────────────────────────────── */}
        <Section className="bg-[#0F172A]">
          <div className="text-center mb-14">
            <MonoLabel>引擎 A — 用户角度 / 匹配层</MonoLabel>
            <motion.h2
              className="text-4xl md:text-5xl font-bold mb-5 text-white"
              style={{ fontFamily: "'Manrope', sans-serif", letterSpacing: '-0.025em' }}
            >
              智能追问匹配：找到对的人问对的话
            </motion.h2>
            <motion.p
              className="text-lg md:text-xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed text-center"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              在识别到"问题"后，我们需要决定在哪个时刻、向哪个用户抛出 1—2 个问题。
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <Card
              title="决策风险排序"
              icon={BarChart3}
              description="系统优先追问对未来用户决策影响最大（Decision Impact）的因素。如果噪音问题是该类属性的痛点，则其优先级高于软装细节。"
            >
              <div
                className="text-[9px] text-slate-600 mt-4 border-t border-slate-700/40 pt-4"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                Impact = Variance × Decision Weight
              </div>
            </Card>
            <Card
              title="用户相关度匹配"
              icon={Users}
              description="通过语义分析用户已填写的评论内容，判断其的实际体验边界。只向刚经历相关场景（如：游泳、早餐）的用户发起对应追问。"
              highlight
            >
              <div
                className="text-[9px] text-blue-400/60 mt-4 border-t border-slate-700/40 pt-4"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                User Relevance Scoring Engine
              </div>
            </Card>
            <Card
              title="低成本交互设计"
              icon={Zap}
              description="避免强制用户输入文字，采用滑动条（Likert Scale）、多选确认或粘贴标签。操作成本最低，核心是：识别而非回忆。"
            >
              <div
                className="text-[9px] text-slate-600 mt-4 border-t border-slate-700/40 pt-4"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                Recognition {'>'} Recall Principle
              </div>
            </Card>
          </div>

          <div className="bg-[#1E293B] p-9 rounded-[2rem] border border-slate-700/50 relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-center gap-10">
              <div className="flex-1">
                <h4
                  className="text-xl font-bold text-white mb-5"
                  style={{ fontFamily: "'Manrope', sans-serif" }}
                >
                  匹配示例 (Matching Logic)
                </h4>
                <div className="space-y-3.5">
                  <div
                    className="flex items-center gap-2.5 text-sm text-slate-400"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    <CheckCircle2 className="text-emerald-400 w-4 h-4 flex-shrink-0" />
                    待填任务：泳池 水温是否为恒温？
                  </div>
                  <div
                    className="flex items-center gap-2.5 text-sm text-slate-400"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    <CheckCircle2 className="text-emerald-400 w-4 h-4 flex-shrink-0" />
                    用户 Review 关键词："带小孩玩水"、"洗衣室干净"
                  </div>
                  <div
                    className="flex items-center gap-2.5 text-sm font-semibold text-blue-400"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    <ArrowRightLeft className="w-4 h-4 flex-shrink-0" />
                    触发追问（只需 1 秒点击）：告诉我们水温如何？
                  </div>
                </div>
              </div>
              <div className="w-full md:w-60 bg-[#0F172A] p-6 rounded-2xl border border-slate-700/50">
                <p
                  className="text-[9px] font-semibold text-slate-600 mb-3 uppercase tracking-widest"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  用户侧的前端显示
                </p>
                <p
                  className="text-sm font-medium text-white mb-5"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  水温让您感到舒适吗？
                </p>
                <div
                  className="flex justify-between text-[10px] text-slate-500 mb-2"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  <span>否</span>
                  <span>是</span>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full relative">
                  <div className="absolute top-1/2 left-3/4 -translate-y-1/2 w-4 h-4 bg-blue-600 rounded-full shadow-md border-2 border-[#0F172A]" />
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Slide 5: 知识更新引擎 ────────────────────────────────────────── */}
        <Section className="bg-[#0F172A] text-white">
          <div className="mb-12 text-center">
            <MonoLabel>引擎 B — 知识反哺层</MonoLabel>
            <motion.h2
              className="text-4xl md:text-5xl font-bold mb-5 text-white"
              style={{ fontFamily: "'Manrope', sans-serif", letterSpacing: '-0.025em' }}
            >
              知识更新引擎：从碎片答案到资产
            </motion.h2>
            <motion.p
              className="text-lg md:text-xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              当用户完成那 1 秒钟的点击，算法引擎开始执行"反哺"流程，完成知识闭环。
            </motion.p>
          </div>

          {/* Before / After 状态变迁图 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-10 bg-[#1E293B] border border-slate-700/50 rounded-[2rem] p-8"
          >
            <div
              className="text-[9px] text-slate-600 uppercase tracking-widest mb-6 text-center"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              State Transition — Before &amp; After AI Intervention
            </div>
            <div className="grid grid-cols-3 gap-4 items-center">

              {/* BEFORE */}
              <div className="flex flex-col items-center gap-4">
                <div
                  className="text-[9px] font-semibold text-slate-600 uppercase tracking-widest"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Before
                </div>
                <div className="w-full bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col items-center gap-3">
                  <Database className="w-7 h-7 text-slate-500" />
                  <div
                    className="text-[9px] text-slate-500"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    静态知识库
                  </div>
                  <div className="flex items-center gap-2 bg-blue-500/15 border border-blue-500/30 rounded-xl px-3 py-2">
                    <span className="text-base">🏊</span>
                    <span
                      className="text-sm font-bold text-blue-300"
                      style={{ fontFamily: "'Manrope', sans-serif" }}
                    >
                      游泳池
                    </span>
                    <span
                      className="text-[9px] text-emerald-400 ml-1"
                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      ✓ 已验证
                    </span>
                  </div>
                  <div
                    className="text-[9px] text-slate-600 text-center"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    last_mentioned: 180d ago<br />avg_score: —
                  </div>
                </div>
              </div>

              {/* PROCESS */}
              <div className="flex flex-col items-center gap-3">
                <div
                  className="text-[9px] font-semibold text-slate-600 uppercase tracking-widest"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Process
                </div>
                <div className="flex flex-col items-center gap-2 w-full">
                  <div className="p-3 bg-purple-500/10 border border-purple-500/25 rounded-2xl w-full">
                    <div className="flex items-center gap-2 mb-2">
                      <BrainCircuit className="w-4 h-4 text-purple-400" />
                      <span
                        className="text-[9px] font-semibold text-purple-300 uppercase"
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        LLM 扫描评论
                      </span>
                    </div>
                    <div className="space-y-1">
                      {['「泳池这周没开」', '「维修中无法使用」', '「游泳池关闭了」'].map((t, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + i * 0.15 }}
                          className="text-[9px] text-slate-400 bg-slate-700/50 rounded px-2 py-1"
                          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          {t}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                  <motion.div
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    transition={{ duration: 0.5, delay: 0.8 }}
                    className="w-full h-px bg-gradient-to-r from-purple-500 to-amber-500 origin-left"
                  />
                  <div
                    className="text-[9px] text-amber-400 text-center"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    staleness {'>'} 半衰期阈值<br />→ 触发置信度重评估
                  </div>
                </div>
              </div>

              {/* AFTER */}
              <div className="flex flex-col items-center gap-4">
                <div
                  className="text-[9px] font-semibold text-slate-600 uppercase tracking-widest"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  After
                </div>
                <div className="w-full bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col items-center gap-3">
                  <RefreshCw className="w-7 h-7 text-emerald-400" />
                  <div
                    className="text-[9px] text-slate-500"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    实时更新画像
                  </div>
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                    <span className="text-base opacity-40">🏊</span>
                    <span
                      className="text-sm font-bold text-amber-300 line-through opacity-60"
                      style={{ fontFamily: "'Manrope', sans-serif" }}
                    >
                      游泳池
                    </span>
                    <span
                      className="text-[9px] text-amber-400 ml-1 font-semibold"
                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      ⚠ 待确认
                    </span>
                  </div>
                  <div
                    className="text-[9px] text-emerald-400 text-center bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    ✓ 属性已更新<br />avg_score → 1.8 ↓
                  </div>
                </div>
              </div>

            </div>
          </motion.div>

          {/* 四步闭环流程 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                step: '01',
                t: '语义挖掘 (Semantic Mining)',
                d: '集成 LLM 对评论进行异步批量分析，通过关键词锚定将原始文本映射到具体酒店属性，提取每个维度的真实用户反馈信号。',
                icon: BrainCircuit,
              },
              {
                step: '02',
                t: '阈值触发 (Threshold Trigger)',
                d: '每条新评论提交后实时更新属性的 last_mentioned_at 时间戳，结合指数衰减曲线计算 staleness 值，超出半衰期即触发置信度重评估。',
                icon: Activity,
              },
              {
                step: '03',
                t: '冲突消解 (Conflict Resolution)',
                d: '对比酒店官方 Description 与用户评论的属性覆盖情况，识别「官方声称存在但评论从未提及」的盲点，作为追问优先级的重要权重。',
                icon: Cpu,
              },
              {
                step: '04',
                t: '闭环更新 (Closed-loop Update)',
                d: '用户追问回答通过 EMA 算法（new = old×0.6 + answer×0.4）持续更新属性的 avg_score，推动酒店画像从静态展示向数据驱动的实时更新闭环演进。',
                icon: Database,
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="bg-[#1E293B] border border-slate-700/50 p-7 rounded-[2rem] relative z-10"
              >
                <div
                  className="text-4xl font-black text-slate-800 mb-4 leading-none"
                  style={{ fontFamily: "'Manrope', sans-serif" }}
                >
                  {item.step}
                </div>
                <item.icon className="w-8 h-8 text-blue-400 mb-4" />
                <h4
                  className="text-sm font-bold text-white mb-2"
                  style={{ fontFamily: "'Manrope', sans-serif" }}
                >
                  {item.t}
                </h4>
                <p
                  className="text-xs text-slate-400 leading-relaxed"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {item.d}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap justify-center gap-12">
            {[
              { value: '实时', label: '新鲜度更新', color: 'text-blue-400' },
              { value: 'EMA', label: '评分融合算法', color: 'text-emerald-400' },
              { value: '闭环', label: '知识反哺机制', color: 'text-blue-400' },
            ].map(({ value, label, color }) => (
              <div key={label} className="text-center">
                <div
                  className={`text-2xl font-bold ${color} mb-1`}
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {value}
                </div>
                <div
                  className="text-[9px] uppercase tracking-widest text-slate-600"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="py-10 text-center bg-[#0F172A] border-t border-slate-800 snap-start">
          <p
            className="text-[10px] text-slate-700 uppercase tracking-[0.22em]"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            PRISM by PARC Group
          </p>
        </footer>
      </div>
    </>
  );
}
