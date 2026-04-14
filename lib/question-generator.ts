import OpenAI from 'openai';
import { Gap, GeneratedQuestion, TravelerPersona } from '@/types';
import { analyzeReviewText } from './gap-detector';
import { TOPIC_LABELS } from './topic-keywords';

// Fallback templates when OpenAI is unavailable
const FALLBACK_TEMPLATES: Record<string, Record<string, string>> = {
  missing: {
    wifi: "How would you rate the Wi-Fi quality during your stay?",
    parking: "Was parking available and easy to use at this property?",
    breakfast: "Did you try the breakfast? Was it worth the cost?",
    noise: "How was the noise level — quiet enough for a good night's sleep?",
    gym: "Did you use the gym or pool? Are they in good condition?",
    ac: "Was the room temperature easy to control?",
    checkin: "How smooth was the check-in process?",
    accessibility: "Was the hotel accessible and easy to navigate?",
    cleanliness: "How clean was your room and the common areas?",
    service: "How would you rate the staff and service quality?",
    value: "Did the hotel feel good value for the price?",
  },
  conflicting: {
    wifi: "We've seen mixed reports on Wi-Fi — was it fast or slow during your stay?",
    noise: "Some guests said it was quiet; others said noisy. What was your experience?",
    breakfast: "Opinions on breakfast are split — was it good or disappointing?",
    parking: "Some guests had parking issues. Was it easy for you?",
    cleanliness: "Cleanliness reviews vary — how clean did you find the hotel?",
    service: "Guest experiences with staff vary widely — how was yours?",
  },
  stale: {
    wifi: "Wi-Fi reviews are mostly older — is it still reliable?",
    gym: "The gym was reviewed a while back — is it still open and well-maintained?",
    breakfast: "Breakfast offerings may have changed — is it still included?",
    checkin: "Check-in experience may have changed — how was it recently?",
    parking: "Parking conditions may have changed — what's the current situation?",
  },
  periodic: {
    cleanliness: "Quick check — was the room and hotel still up to cleanliness standards?",
    wifi: "Just checking in: is the Wi-Fi still reliable?",
    ac: "Still checking: does the air conditioning work well?",
  },
};

function getFallbackQuestion(gap: Gap): GeneratedQuestion {
  const template =
    FALLBACK_TEMPLATES[gap.gap_type]?.[gap.topic] ||
    FALLBACK_TEMPLATES['missing']?.[gap.topic] ||
    `How was the ${TOPIC_LABELS[gap.topic] || gap.topic} during your stay?`;

  return {
    text: template,
    topic: gap.topic,
    gap_type: gap.gap_type,
    selection_case: 'C',
    why_this_user: `Your recent stay makes you well-positioned to answer this.`,
  };
}

export async function generateFollowUpQuestions(params: {
  reviewText: string;
  propertyDescription: string;
  detectedGaps: Gap[];
  persona?: TravelerPersona;
}): Promise<GeneratedQuestion[]> {
  const { reviewText, propertyDescription, detectedGaps, persona } = params;

  // Always analyze the review text
  const { mentionedTopics, hasNegativeSentiment, negativePhrases } =
    analyzeReviewText(reviewText);

  // If no OpenAI key, fall back to template-based questions
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key') {
    return fallbackQuestionSelection({
      mentionedTopics,
      hasNegativeSentiment,
      negativePhrases,
      detectedGaps,
      persona,
    });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const gapSummary = detectedGaps
      .slice(0, 6)
      .map(g => `- [${g.gap_type.toUpperCase()}] ${TOPIC_LABELS[g.topic] || g.topic}: ${g.evidence}`)
      .join('\n');

    const prompt = `You are an AI assistant for Expedia helping fill gaps in hotel property knowledge.

A guest just submitted this review:
"${reviewText}"

Property context:
"${propertyDescription.slice(0, 500)}"

Information gaps detected in this property's review corpus:
${gapSummary || 'No specific gaps detected — use general quality topics.'}

Guest travel persona: ${persona ?? 'unknown'}

DECISION RULES (apply in this strict priority order):
1. CASE A — If the guest MENTIONED a topic that is also a known gap → ask a follow-up that goes deeper on that specific topic
2. CASE B — If the guest expressed CRITICISM or NEGATIVE sentiment → ask what specifically was wrong, or what would have improved it (extracts structured data from vague complaints)
3. CASE C — If the guest's review doesn't overlap with any gap topic → ask about the most critical gap relevant to their persona

CONSTRAINTS:
- Generate exactly 1-2 questions. No more.
- Each question MUST be answerable with "Good", "Bad", or "I don't know" — or a brief voice/text elaboration.
- Do NOT ask about topics the guest already thoroughly addressed.
- Match the question to the guest's persona (e.g., skip kids' pool for business traveler, skip WiFi for accessibility-focused guest if irrelevant).
- Write in natural, warm conversational English — not robotic survey language.

Respond in valid JSON only, no other text:
{
  "questions": [
    {
      "text": "The question text to show the guest",
      "topic": "wifi|parking|breakfast|noise|cleanliness|gym|ac|checkin|accessibility|service|value",
      "gap_type": "missing|conflicting|stale|periodic|complaint_followup",
      "selection_case": "A|B|C",
      "why_this_user": "One sentence: why is this specific guest the right person to answer?"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.3,
    });

    const parsed = JSON.parse(response.choices[0].message.content!);
    const questions: GeneratedQuestion[] = (parsed.questions || []).slice(0, 2);

    if (questions.length === 0) throw new Error('No questions returned');
    return questions;
  } catch (err) {
    console.error('[question-generator] OpenAI error, using fallback:', err);
    return fallbackQuestionSelection({
      mentionedTopics,
      hasNegativeSentiment,
      negativePhrases,
      detectedGaps,
      persona,
    });
  }
}

function fallbackQuestionSelection(params: {
  mentionedTopics: string[];
  hasNegativeSentiment: boolean;
  negativePhrases: string[];
  detectedGaps: Gap[];
  persona?: TravelerPersona;
}): GeneratedQuestion[] {
  const { mentionedTopics, hasNegativeSentiment, negativePhrases, detectedGaps, persona } = params;
  const questions: GeneratedQuestion[] = [];

  // Case A: Review mentions a gap topic → deepen it
  const matchingGap = detectedGaps.find(g => mentionedTopics.includes(g.topic));
  if (matchingGap) {
    const q = getFallbackQuestion(matchingGap);
    questions.push({ ...q, selection_case: 'A', why_this_user: `You mentioned ${TOPIC_LABELS[matchingGap.topic] || matchingGap.topic} in your review.` });
  }

  // Case B: Complaint → follow up on the negative point
  if (hasNegativeSentiment && questions.length < 2) {
    const negGap = detectedGaps.find(g => mentionedTopics.includes(g.topic));
    const snippet = negativePhrases[0] || 'your concern';
    questions.push({
      text: `You mentioned something that wasn't quite right — what specifically could the hotel improve based on your stay?`,
      topic: negGap?.topic || 'service',
      gap_type: 'complaint_followup',
      selection_case: 'B',
      why_this_user: `Based on your feedback: "${snippet}"`,
    });
  }

  // Case C: No overlap → ask top gap for this persona
  if (questions.length === 0) {
    const personaTopicPriority: Record<string, string[]> = {
      business: ['wifi', 'checkin', 'noise', 'ac'],
      family: ['cleanliness', 'noise', 'breakfast', 'accessibility'],
      solo: ['wifi', 'checkin', 'noise'],
      couple: ['noise', 'breakfast', 'gym'],
      car: ['parking', 'checkin'],
      accessibility: ['accessibility', 'checkin', 'ac'],
    };
    const priority = personaTopicPriority[persona || ''] || [];
    const topGap =
      detectedGaps.find(g => priority.includes(g.topic)) || detectedGaps[0];

    if (topGap) {
      questions.push({ ...getFallbackQuestion(topGap), selection_case: 'C' });
    }
  }

  return questions.slice(0, 2);
}
