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
            whileInView={{ pathLength: 1 }}
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
            PRISM 的核心由两个相互协作的算法引擎组成：一个负责高效“索取”信息，另一个负责精炼“反哺”知识。
          </motion.p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card
            title="引擎 A: 智能追问算法"
            description="Focus: 如何以最小的用户负担，获取最高价值的缺失信息补丁。"
            icon={MessageSquare}
            highlight
          >
            <div className="mt-4 flex flex-wrap gap-2 text-slate-300">
              <span className="bg-slate-700 text-[10px] px-2 py-1 rounded">衰减检测</span>
              <span className="bg-slate-700 text-[10px] px-2 py-1 rounded">盲点识别</span>
              <span className="bg-slate-700 text-[10px] px-2 py-1 rounded">决策匹配</span>
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
          <Title>信息健康度检测：属性维度的“全能体检”</Title>
          <Subtitle>系统在天亮扫描属性知识库，识别哪些地方需要“外部信息补给”。</Subtitle>
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
          <Subtitle>PRISM 如何判断“哪些信息过时，下一步问什么问题”的底层实现</Subtitle>
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

          <div className="flex flex-col p-8 rounded-[2rem] bg-slate-900 text-white shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[60px] group-hover:bg-blue-500/20 transition-all"></div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-white/10 rounded-xl"><Zap className="text-yellow-400" /></div>
              <h4 className="text-xl font-bold">第三层: 最终紧急度评分<br/><span className="text-xs font-mono text-slate-500 font-normal">Follow-up Prioritization Engine</span></h4>
            </div>

            <div className="space-y-4 pt-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between animate-pulse">
                <div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">Current Top Priority</div>
                  <div className="text-lg font-bold">Safety <span className="text-xs font-normal text-red-500">(STALE)</span></div>
                </div>
                <div className="text-2xl font-black text-red-500 font-mono">9.8</div>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">High Priority</div>
                  <div className="text-lg font-bold">Wifi <span className="text-xs font-normal text-yellow-500">(STALE)</span></div>
                </div>
                <div className="text-2xl font-black text-yellow-500 font-mono">7.2</div>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between opacity-50">
                <div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">Low Priority</div>
                  <div className="text-lg font-bold">Gym <span className="text-xs font-normal text-blue-500">(STALE)</span></div>
                </div>
                <div className="text-2xl font-black text-blue-500 font-mono">1.5</div>
              </div>
            </div>

            <div className="mt-auto pt-8">
              <div className="p-4 rounded-xl bg-blue-500 text-center font-bold text-sm flex items-center justify-center gap-2">
                <Zap /> Triggering Follow-up Questions
              </div>
              <div className="mt-4 text-[10px] font-mono text-slate-500 text-center">
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
          <motion.p className="text-xl md:text-2xl text-slate-500 mb-12 max-w-3xl mx-auto leading-relaxed text-center">在识别到“问题”后，我们需要决定在哪个时刻、向哪个用户抛出 1—2 个问题。</motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <Card title="决策风险排序" icon={BarChart3} description="系统优先追问对未来用户决策影响最大（Decision Impact）的因素。如果噪音问题是该类属性的痛点，则其优先级高于软装细节。">
            <div className="text-[10px] text-slate-400 mt-4 border-t pt-4">Impact = Variance × Decision Weight</div>
          </Card>
          <Card title="用户相关度匹配" icon={Users} description="通过语义分析用户已填写的评论内容，判断其的实际体验边界。只向刚经历相关场景（如：游泳、早餐）的用户发起对应追问。" highlight>
            <div className="text-[10px] text-blue-300 mt-4 border-t border-slate-700 pt-4">User Relevance Scoring Engine</div>
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
                  <CheckCircle2 className="text-green-500 w-4 h-4" /> 用户 Review 关键词：“带小孩玩水”、“洗衣室干净”
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
        <div className="mb-16 text-center">
          <motion.div className="text-blue-400 font-bold mb-2 uppercase tracking-wide">引擎 B - 知识反哺层</motion.div>
          <motion.h2 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">知识更新引擎：从碎片答案到资产</motion.h2>
          <motion.p className="text-xl md:text-2xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed">当用户完成那 1 秒钟的点击，算法引擎开始执行“反哺”流程，完成知识闭环。</motion.p>
        </div>

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

      {/* Footer */}
      <footer className="py-12 text-center text-slate-400 bg-white border-t border-slate-200 snap-start">
        <p className="text-sm italic tracking-widest uppercase">PRISM by PARC Group</p>
      </footer>
    </div>
  );
}
