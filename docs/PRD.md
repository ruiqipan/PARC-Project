# PARC APP — Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** 2026-04-14  
**Status:** Draft

---

## 1. Executive Summary & Value Proposition

### Problem

Hotel reviews are shallow, inconsistent, and miss high-signal details (accessibility needs, business travel specifics, family logistics). Platforms lose information because friction kills follow-through.

### Solution

PARC is a hotel review platform with an embedded **Information Gap Detection Engine** — an AI layer that identifies what is missing from a hotel's review corpus and asks targeted, low-friction follow-up questions via text, voice, or tap-to-answer.

### Value Propositions

- **For travelers:** Faster, richer answers to specific questions before booking
- **For hotels:** Structured feedback tied to real experience dimensions
- **For the platform:** Proprietary, high-density review data that improves over time
- **Moat:** Gap detection improves as review volume grows — compounding data flywheel

### KPIs

| Metric | Target |
|---|---|
| Review completion rate | >65% (industry baseline ~30%) |
| Questions answered per session | ≥3 |
| Gap coverage score per hotel | % of 15 rating dimensions with ≥10 data points |
| Return visit rate | Driven by "your question was answered" notifications |

---

## 2. Core User Flows

### 2a. Onboarding

```
Landing → Sign Up (email / OAuth)
  → Persona Selection (1 of 5)
  → Brief preference survey (3 questions, tap-to-answer)
  → Redirected to hotel browse feed
```

**Persona types:**
- Business Traveler
- Family
- Solo
- Couple
- Accessibility-focused

### 2b. Browsing Reviews

```
Hotel List → Filter (city, rating, amenities) → Hotel Detail
  → Overview tab → Reviews tab
      → ReviewFeed (paginated, 20/page)
      → "Questions from travelers like you" module (persona-aware)
      → Answer a quick question CTA (tap, text, or voice)
```

### 2c. Writing a Review

```
Post-stay trigger (email / in-app)
  → 5-star overall + 3 key sub-ratings
  → Free-text field (text OR voice via Whisper transcription)
  → AI gap scan runs async
  → 2–4 follow-up micro-questions surfaced
  → Each question: tap-to-answer chip | short text | voice clip (15s)
  → Submit → gap coverage recalculated → badge awarded
```

### 2d. AI Follow-Up Loop

```
Background job detects gap for hotel X
  → Identify users who stayed at hotel X (or similar persona)
  → Push notification / email: "Quick question about your stay"
  → Single-question card (1 tap or 1 sentence)
  → Response stored → gap score updated → loop re-evaluates
```

---

## 3. Feature Requirements

### Must Have (P0)

- [ ] User authentication (email + OAuth)
- [ ] Persona selection and preference storage
- [ ] Hotel browse and detail pages (existing)
- [ ] Review feed display (existing)
- [ ] Review submission (text + voice)
- [ ] Whisper transcription for voice input
- [ ] Gap Detection Engine (Layer 1)
- [ ] Question serving API with persona routing (Layers 3–4)
- [ ] Tap-to-answer and short-text response UI

### Should Have (P1)

- [ ] LLM question generation with semantic dedup (Layer 2)
- [ ] Push/email follow-up notifications
- [ ] Question skip/flag feedback signals
- [ ] Per-hotel gap coverage dashboard
- [ ] Gamification: badges for review completeness

### Nice to Have (P2)

- [ ] Hotel owner response portal
- [ ] Comparative gap analysis across similar hotels
- [ ] Multilingual question generation
- [ ] Real-time gap score updates via Supabase Realtime

---

## 4. Non-Functional Requirements

- **Latency:** Question serving API < 200ms (served from indexed DB, not LLM)
- **LLM calls:** Async only; never block user interactions
- **Voice clips:** Max 15 seconds; stored in Supabase Storage; signed URLs expire in 1h
- **Privacy:** Voice transcripts stored as text only after user consent; raw audio deleted after 24h
- **Availability:** 99.9% uptime via Vercel + Supabase managed infra
- **Mobile:** All flows fully functional on iOS Safari and Android Chrome
