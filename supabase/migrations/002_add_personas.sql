-- Migration 002: Personas table + seed data

CREATE TABLE IF NOT EXISTS public.personas (
  id               serial PRIMARY KEY,
  name             text NOT NULL UNIQUE,
  description      text,
  question_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Seed the 5 core personas with dimension weights
INSERT INTO public.personas (name, description, question_weights) VALUES
(
  'business',
  'Frequent business travelers prioritizing connectivity, efficiency, and comfort.',
  '{
    "wifi": 1.8, "service": 1.4, "checkin": 1.3, "location": 1.3,
    "roomcleanliness": 1.2, "roomcomfort": 1.3, "valueformoney": 1.2,
    "hotelcondition": 1.1, "accessibility": 0.8, "ecofriendliness": 0.7,
    "roomamenitiesscore": 1.2, "roomquality": 1.2, "communication": 1.5,
    "convenienceoflocation": 1.5, "neighborhoodsatisfaction": 1.0
  }'
),
(
  'family',
  'Families traveling with children, prioritizing space, safety, and kid-friendly amenities.',
  '{
    "wifi": 1.2, "service": 1.6, "checkin": 1.2, "location": 1.5,
    "roomcleanliness": 1.8, "roomcomfort": 1.7, "valueformoney": 1.6,
    "hotelcondition": 1.4, "accessibility": 1.2, "ecofriendliness": 1.0,
    "roomamenitiesscore": 1.5, "roomquality": 1.5, "communication": 1.3,
    "convenienceoflocation": 1.5, "neighborhoodsatisfaction": 1.3
  }'
),
(
  'solo',
  'Solo travelers valuing location, social atmosphere, and value.',
  '{
    "wifi": 1.5, "service": 1.1, "checkin": 1.2, "location": 1.6,
    "roomcleanliness": 1.3, "roomcomfort": 1.2, "valueformoney": 1.7,
    "hotelcondition": 1.1, "accessibility": 0.9, "ecofriendliness": 1.1,
    "roomamenitiesscore": 1.0, "roomquality": 1.1, "communication": 1.2,
    "convenienceoflocation": 1.6, "neighborhoodsatisfaction": 1.5
  }'
),
(
  'couple',
  'Couples seeking ambiance, comfort, and memorable experiences.',
  '{
    "wifi": 1.0, "service": 1.5, "checkin": 1.3, "location": 1.7,
    "roomcleanliness": 1.4, "roomcomfort": 1.7, "valueformoney": 1.3,
    "hotelcondition": 1.5, "accessibility": 0.9, "ecofriendliness": 1.2,
    "roomamenitiesscore": 1.6, "roomquality": 1.6, "communication": 1.2,
    "convenienceoflocation": 1.7, "neighborhoodsatisfaction": 1.5
  }'
),
(
  'accessibility',
  'Travelers with mobility, sensory, or other accessibility requirements.',
  '{
    "wifi": 1.0, "service": 1.8, "checkin": 1.5, "location": 1.4,
    "roomcleanliness": 1.3, "roomcomfort": 1.6, "valueformoney": 1.2,
    "hotelcondition": 1.6, "accessibility": 2.0, "ecofriendliness": 0.8,
    "roomamenitiesscore": 1.5, "roomquality": 1.4, "communication": 1.7,
    "convenienceoflocation": 1.4, "neighborhoodsatisfaction": 1.2
  }'
)
ON CONFLICT (name) DO NOTHING;

-- Add FK from users to personas
ALTER TABLE public.users
  ADD CONSTRAINT fk_users_persona
  FOREIGN KEY (persona_id) REFERENCES public.personas(id);
