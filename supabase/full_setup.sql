-- ============================================================
-- PARC — Full Setup Script
-- Paste this ENTIRE file into the Supabase SQL Editor and run it.
-- This creates all tables AND seeds demo data in one shot.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Drop existing tables (clean slate) ───────────────────────────────────────
DROP TABLE IF EXISTS question_feedback CASCADE;
DROP TABLE IF EXISTS responses CASCADE;
DROP TABLE IF EXISTS review_submissions CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS hotels CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;

-- ── hotels ───────────────────────────────────────────────────────────────────
CREATE TABLE hotels (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    eg_property_id              TEXT UNIQUE,
    name                        TEXT,
    slug                        TEXT UNIQUE,
    city                        TEXT,
    province                    TEXT,
    country                     TEXT DEFAULT 'US',
    star_rating                 SMALLINT,
    expedia_rating              NUMERIC(3,1),
    area_description            TEXT,
    property_description        TEXT,
    popular_amenities_list      TEXT,
    amenities                   TEXT[] DEFAULT '{}',
    thumbnail_url               TEXT,
    price_per_night             INTEGER,
    review_count                INTEGER DEFAULT 0,
    check_in_start_time         TEXT,
    check_in_end_time           TEXT,
    check_out_time              TEXT,
    check_out_policy            TEXT,
    pet_policy                  TEXT,
    children_and_extra_bed_policy TEXT,
    check_in_instructions       TEXT,
    know_before_you_go          TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── reviews ──────────────────────────────────────────────────────────────────
CREATE TABLE reviews (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id          UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    eg_property_id    TEXT,
    reviewer_name     TEXT,
    traveler_persona  TEXT,
    rating            NUMERIC(2,1) DEFAULT 0,
    review_title      TEXT,
    review_text       TEXT NOT NULL,
    acquisition_date  DATE,
    lob               TEXT,
    helpful_count     INTEGER DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reviews_hotel_id ON reviews(hotel_id);

-- ── rooms ────────────────────────────────────────────────────────────────────
CREATE TABLE rooms (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id        UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    capacity        SMALLINT DEFAULT 2,
    price_per_night INTEGER,
    amenities       TEXT[] DEFAULT '{}',
    image_url       TEXT,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rooms_hotel_id ON rooms(hotel_id);

-- ── questions ────────────────────────────────────────────────────────────────
CREATE TABLE questions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id         UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    room_type_id     UUID REFERENCES rooms(id),
    topic            TEXT NOT NULL,
    gap_type         TEXT NOT NULL,
    question_text    TEXT NOT NULL,
    target_personas  TEXT[] DEFAULT '{}',
    confidence_score NUMERIC(4,3) DEFAULT 0.500,
    upvotes          INTEGER DEFAULT 0,
    downvotes        INTEGER DEFAULT 0,
    response_count   INTEGER DEFAULT 0,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_questions_hotel_id ON questions(hotel_id);

-- ── user_sessions ────────────────────────────────────────────────────────────
CREATE TABLE user_sessions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    persona       TEXT,
    special_needs TEXT[] DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── review_submissions ───────────────────────────────────────────────────────
CREATE TABLE review_submissions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id    UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    session_id  UUID REFERENCES user_sessions(id),
    review_text TEXT NOT NULL,
    rating      NUMERIC(2,1),
    persona     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── responses ────────────────────────────────────────────────────────────────
CREATE TABLE responses (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id  UUID REFERENCES questions(id) ON DELETE CASCADE,
    session_id   UUID REFERENCES user_sessions(id),
    hotel_id     UUID REFERENCES hotels(id),
    answer       TEXT NOT NULL CHECK (answer IN ('good','bad','unknown')),
    comment_text TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_responses_question_id ON responses(question_id);
CREATE INDEX idx_responses_hotel_id    ON responses(hotel_id);

-- ── question_feedback ────────────────────────────────────────────────────────
CREATE TABLE question_feedback (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    session_id  UUID REFERENCES user_sessions(id),
    vote        TEXT NOT NULL CHECK (vote IN ('up','down')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Triggers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_question_votes() RETURNS TRIGGER AS $$
BEGIN
    UPDATE questions SET
        upvotes   = (SELECT COUNT(*) FROM question_feedback WHERE question_id = NEW.question_id AND vote = 'up'),
        downvotes = (SELECT COUNT(*) FROM question_feedback WHERE question_id = NEW.question_id AND vote = 'down')
    WHERE id = NEW.question_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_sync_question_votes AFTER INSERT ON question_feedback FOR EACH ROW EXECUTE FUNCTION sync_question_votes();

CREATE OR REPLACE FUNCTION increment_response_count() RETURNS TRIGGER AS $$
BEGIN
    UPDATE questions SET response_count = response_count + 1 WHERE id = NEW.question_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_increment_response_count AFTER INSERT ON responses FOR EACH ROW EXECUTE FUNCTION increment_response_count();

-- ════════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ════════════════════════════════════════════════════════════════════════════

-- ── Hotel 1: The Meridian (Business hotel — WiFi conflict + stale gym) ───────
INSERT INTO hotels (eg_property_id, name, slug, city, province, country, star_rating, expedia_rating,
    area_description, property_description, popular_amenities_list, amenities, thumbnail_url,
    price_per_night, review_count,
    check_in_start_time, check_in_end_time, check_out_time, check_out_policy,
    pet_policy, children_and_extra_bed_policy, check_in_instructions, know_before_you_go)
VALUES (
    'EXP001', 'The Meridian Seattle', 'the-meridian-seattle',
    'Seattle', 'WA', 'US', 4, 4.2,
    'Located in the heart of downtown Seattle, steps from Pike Place Market and the waterfront.',
    'The Meridian is a contemporary business hotel offering sleek rooms, a rooftop bar, and a state-of-the-art fitness center. Ideal for corporate travelers seeking style and productivity.',
    'Free WiFi, Business center, Fitness center, Rooftop bar, Valet parking',
    ARRAY['Free WiFi', 'Business center', 'Fitness center', 'Rooftop bar', 'Valet parking', 'Concierge'],
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80',
    28900, 187,
    '3:00 PM', '11:59 PM', '12:00 PM',
    'Late checkout available upon request for a fee. Early checkout: no penalty with 24h notice.',
    'Pets not allowed.',
    'Children under 12 stay free. Cribs available on request.',
    'Check-in at main lobby. ID and credit card required. Valet available 24/7 at $45/night.',
    'Parking garage clearance: 6ft 6in. Construction on 4th Ave may cause noise Mon–Fri before 9 AM.'
);

-- ── Hotel 2: Oceanfront Suites Miami (Family — parking missing + cleanliness conflict) ──
INSERT INTO hotels (eg_property_id, name, slug, city, province, country, star_rating, expedia_rating,
    area_description, property_description, popular_amenities_list, amenities, thumbnail_url,
    price_per_night, review_count,
    check_in_start_time, check_out_time, check_out_policy, pet_policy, children_and_extra_bed_policy,
    check_in_instructions, know_before_you_go)
VALUES (
    'EXP002', 'Oceanfront Suites Miami', 'oceanfront-suites-miami',
    'Miami Beach', 'FL', 'US', 4, 4.5,
    'Beachfront location on Collins Avenue, South Beach. Steps from the Art Deco Historic District.',
    'A vibrant beachfront resort with direct ocean access, multiple pools, and all-inclusive dining options. Perfect for families and couples seeking the ultimate Miami experience.',
    'Beachfront, Multiple pools, All-inclusive dining, Kids club, Spa',
    ARRAY['Beachfront', 'Pool', 'Kids club', 'Spa', 'Restaurant', 'Bar', 'Free breakfast'],
    'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80',
    42000, 312,
    '4:00 PM', '11:00 AM',
    'Late checkout until 2 PM available for $50.',
    'Pets under 20 lbs welcome. $75/night pet fee.',
    'Children welcome. Kids club ages 4–12. Cribs free of charge.',
    'Check-in at the main beach-facing lobby. Wristbands required for all-inclusive access.',
    'Beach towels provided. Umbrellas $15/day. Jet ski rentals available at the water sports hut.'
);

-- ── Hotel 3: Budget Inn Express Portland (Mixed — value debate + noise conflict) ─
INSERT INTO hotels (eg_property_id, name, slug, city, province, country, star_rating, expedia_rating,
    area_description, property_description, popular_amenities_list, amenities, thumbnail_url,
    price_per_night, review_count,
    check_in_start_time, check_out_time, pet_policy, children_and_extra_bed_policy,
    check_in_instructions, know_before_you_go)
VALUES (
    'EXP003', 'Budget Inn Express Portland', 'budget-inn-express-portland',
    'Portland', 'OR', 'US', 2, 3.6,
    'Located near Portland International Airport. Free shuttle service available every 30 minutes.',
    'Clean, affordable rooms with complimentary breakfast and free airport shuttle. Great for layovers and budget-conscious travelers.',
    'Free breakfast, Airport shuttle, Free parking, WiFi',
    ARRAY['Free breakfast', 'Airport shuttle', 'Free parking', 'WiFi', '24h front desk'],
    'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80',
    8900, 234,
    '2:00 PM', '11:00 AM',
    'Pets not allowed.',
    'Children under 18 stay free with parents.',
    'Self check-in kiosk available after 10 PM. Front desk open 24 hours.',
    'Airport shuttle runs every 30 minutes. Last shuttle at 1 AM. Parking free and uncovered.'
);

-- ── Hotel 4: The Grand Palace Chicago (Luxury — accessibility missing + stale breakfast) ──
INSERT INTO hotels (eg_property_id, name, slug, city, province, country, star_rating, expedia_rating,
    area_description, property_description, popular_amenities_list, amenities, thumbnail_url,
    price_per_night, review_count,
    check_in_start_time, check_out_time, pet_policy, children_and_extra_bed_policy,
    check_in_instructions, know_before_you_go)
VALUES (
    'EXP004', 'The Grand Palace Chicago', 'the-grand-palace-chicago',
    'Chicago', 'IL', 'US', 5, 4.7,
    'Michigan Avenue luxury, steps from Millennium Park and the Art Institute of Chicago.',
    'Chicago''s premier luxury address since 1923. Featuring iconic architecture, Michelin-starred dining, a full-service spa, and unparalleled service tailored to discerning travelers.',
    'Michelin dining, Full spa, Concierge, Valet, Lake view rooms',
    ARRAY['Spa', 'Restaurant', 'Bar', 'Concierge', 'Valet parking', 'Pool', 'Gym', 'Room service'],
    'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80',
    58000, 445,
    '3:00 PM', '12:00 PM',
    'Pets up to 50 lbs welcome. No fee.',
    'Children welcome. Babysitting available. Cribs complimentary.',
    'Butler service available. White-glove check-in in private lounges for suite guests.',
    'Valet parking $75/night. Self-parking at adjacent garage $50/night.'
);

-- ── Hotel 5: Cozy Inn Austin (Solo/couple — service conflict + checkin stale) ─
INSERT INTO hotels (eg_property_id, name, slug, city, province, country, star_rating, expedia_rating,
    area_description, property_description, popular_amenities_list, amenities, thumbnail_url,
    price_per_night, review_count,
    check_in_start_time, check_out_time, pet_policy, children_and_extra_bed_policy,
    check_in_instructions, know_before_you_go)
VALUES (
    'EXP005', 'Cozy Inn Austin', 'cozy-inn-austin',
    'Austin', 'TX', 'US', 3, 4.0,
    'Located in the heart of Austin''s Sixth Street entertainment district. Walking distance to live music venues and restaurants.',
    'A charming boutique inn featuring locally-inspired decor, a rooftop terrace, and handcrafted cocktails. Perfect for solo travelers and couples exploring Austin''s vibrant scene.',
    'Rooftop bar, Free WiFi, Local art, Bike rentals',
    ARRAY['Rooftop bar', 'Free WiFi', 'Bike rental', 'Concierge', 'Local art gallery'],
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&q=80',
    16500, 156,
    '3:00 PM', '11:00 AM',
    'Pets welcome. No extra charge.',
    'Not suitable for children under 10 (rooftop bar environment).',
    'Keyless entry via mobile app. Code sent 2h before check-in. No front desk — virtual concierge only.',
    'Street parking free after 6 PM and all day Sunday. Live music from Sixth Street audible nightly.'
);

-- ════════════════════════════════════════════════════════════════════════════
-- ROOMS
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    h1 UUID; h2 UUID; h3 UUID; h4 UUID; h5 UUID;
BEGIN
    SELECT id INTO h1 FROM hotels WHERE slug = 'the-meridian-seattle';
    SELECT id INTO h2 FROM hotels WHERE slug = 'oceanfront-suites-miami';
    SELECT id INTO h3 FROM hotels WHERE slug = 'budget-inn-express-portland';
    SELECT id INTO h4 FROM hotels WHERE slug = 'the-grand-palace-chicago';
    SELECT id INTO h5 FROM hotels WHERE slug = 'cozy-inn-austin';

    -- Meridian Seattle rooms
    INSERT INTO rooms (hotel_id, name, type, capacity, price_per_night, amenities, image_url, description) VALUES
    (h1, 'Deluxe King Room', 'king', 2, 28900, ARRAY['King bed','Work desk','City view','Mini fridge','Premium WiFi'], 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80', 'Spacious king room with skyline views and dedicated workspace.'),
    (h1, 'Executive Suite', 'suite', 2, 45000, ARRAY['King bed','Separate living room','Lounge access','Kitchenette','Premium WiFi'], 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&q=80', 'Full suite with separate living area and executive lounge access.'),
    (h1, 'Twin Business Room', 'twin', 2, 24900, ARRAY['Two full beds','Work desk','Free WiFi','Blackout curtains'], 'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?w=600&q=80', 'Two comfortable beds with full business amenities.'),
    (h1, 'Accessible King Room', 'accessible', 2, 26900, ARRAY['King bed','Roll-in shower','Grab bars','Low fixtures','Wide doorways'], 'https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?w=600&q=80', 'Fully ADA-compliant room with roll-in shower and accessible bathroom.');

    -- Oceanfront Miami rooms
    INSERT INTO rooms (hotel_id, name, type, capacity, price_per_night, amenities, image_url, description) VALUES
    (h2, 'Ocean View King', 'king', 2, 42000, ARRAY['King bed','Ocean view','Balcony','Minibar','Free WiFi'], 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80', 'Wake up to breathtaking ocean views from your private balcony.'),
    (h2, 'Family Suite', 'family', 4, 62000, ARRAY['King bed + sofa bed','Kitchenette','Two bathrooms','Kids welcome kit'], 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=600&q=80', 'Spacious suite perfect for families with young children.'),
    (h2, 'Pool View Twin', 'twin', 2, 38000, ARRAY['Two queen beds','Pool view','Balcony','Free WiFi'], 'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?w=600&q=80', 'Comfortable twin room overlooking the resort pools.'),
    (h2, 'Accessible Ocean Room', 'accessible', 2, 40000, ARRAY['King bed','Ocean view','Roll-in shower','Grab bars','Balcony'], 'https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?w=600&q=80', 'Accessible oceanfront room with roll-in shower and beach access.');

    -- Budget Inn Portland rooms
    INSERT INTO rooms (hotel_id, name, type, capacity, price_per_night, amenities, image_url, description) VALUES
    (h3, 'Standard Queen', 'standard', 2, 8900, ARRAY['Queen bed','Free WiFi','Work desk','Coffee maker'], 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=600&q=80', 'Clean and comfortable standard room with all essentials.'),
    (h3, 'Double Twin Room', 'twin', 4, 9900, ARRAY['Two twin beds','Free WiFi','Microwave','Mini fridge'], 'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?w=600&q=80', 'Budget-friendly twin room, great for small groups.'),
    (h3, 'King Room', 'king', 2, 10900, ARRAY['King bed','Free WiFi','Work desk','Blackout curtains'], 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80', 'Upgraded king room with extra space and comfort.');

    -- Grand Palace Chicago rooms
    INSERT INTO rooms (hotel_id, name, type, capacity, price_per_night, amenities, image_url, description) VALUES
    (h4, 'Lake View King', 'king', 2, 58000, ARRAY['King bed','Lake Michigan view','Marble bathroom','Butler service','Premium minibar'], 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80', 'Stunning lake views from a beautifully appointed king room.'),
    (h4, 'Presidential Suite', 'suite', 4, 150000, ARRAY['Master bedroom','Grand piano','Private dining room','Butler','Panoramic views'], 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&q=80', 'The ultimate Chicago luxury experience spanning 2,400 sq ft.'),
    (h4, 'Accessible Deluxe Room', 'accessible', 2, 55000, ARRAY['King bed','Roll-in shower','Grab bars','Lake view','Wide doorways'], 'https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?w=600&q=80', 'Fully accessible luxury room with all premium amenities.');

    -- Cozy Inn Austin rooms
    INSERT INTO rooms (hotel_id, name, type, capacity, price_per_night, amenities, image_url, description) VALUES
    (h5, 'Lonestar King Room', 'king', 2, 16500, ARRAY['King bed','Local art','Free WiFi','Rooftop access','Mini fridge'], 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80', 'Locally-inspired king room with exclusive rooftop access.'),
    (h5, 'Bungalow Twin', 'twin', 2, 14500, ARRAY['Two full beds','Free WiFi','Work desk','Rooftop access'], 'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?w=600&q=80', 'Cozy twin bungalow with access to all common areas.');

END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- REVIEWS (15-20 per hotel, designed to trigger gap detection cases)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE h1 UUID; h2 UUID; h3 UUID; h4 UUID; h5 UUID;
BEGIN
    SELECT id INTO h1 FROM hotels WHERE slug = 'the-meridian-seattle';
    SELECT id INTO h2 FROM hotels WHERE slug = 'oceanfront-suites-miami';
    SELECT id INTO h3 FROM hotels WHERE slug = 'budget-inn-express-portland';
    SELECT id INTO h4 FROM hotels WHERE slug = 'the-grand-palace-chicago';
    SELECT id INTO h5 FROM hotels WHERE slug = 'cozy-inn-austin';

-- ── Meridian Seattle Reviews (WiFi CONFLICT + GYM STALE) ─────────────────────
INSERT INTO reviews (hotel_id, reviewer_name, traveler_persona, rating, review_title, review_text, acquisition_date) VALUES
(h1, 'Marcus T.', 'business', 4.5, 'Great hotel for work trips', 'Perfect location for my conference. The room was spacious with a solid work desk. WiFi was excellent — I streamed a 4K presentation without any drops. Check-in was smooth and the staff were professional.', '2025-12-10'),
(h1, 'Jennifer L.', 'business', 3.0, 'WiFi let me down during calls', 'Beautiful hotel overall and great location. However the WiFi was terrible during my stay. My video calls kept dropping. I had to use my phone hotspot for important meetings. Very disappointing for a business hotel.', '2025-11-28'),
(h1, 'David R.', 'solo', 4.0, 'Solid downtown option', 'Clean rooms, helpful concierge. The rooftop bar has amazing views. Did not try the gym but it looked nice from the window. WiFi was decent but slowed down around 7 PM during peak hours.', '2025-12-01'),
(h1, 'Priya K.', 'business', 5.0, 'Exceeded expectations', 'Stayed for a week-long conference. WiFi was fast and consistent the entire time — I ran multiple video calls daily without issues. Room was immaculate. The business center is well equipped. Will definitely return.', '2026-01-15'),
(h1, 'Robert M.', 'business', 2.5, 'WiFi disaster ruined my stay', 'I cannot stress enough how bad the WiFi was. Slow, unreliable, constantly dropping. For a hotel that markets itself to business travelers, this is unacceptable. The room itself was nice but WiFi made the stay frustrating.', '2025-10-20'),
(h1, 'Sarah W.', 'couple', 4.5, 'Romantic city getaway', 'Wonderful weekend. The rooftop bar was perfect for cocktails with a view. Room was lovely and very clean. Staff were incredibly helpful. We did not drive so cannot speak to parking, but location made transport easy.', '2025-11-05'),
(h1, 'James H.', 'business', 4.0, 'Good overall, WiFi inconsistent', 'This is a good business hotel. Comfortable rooms, convenient location. WiFi worked well in the morning but was sluggish by evening — probably due to conference guests using the network simultaneously.', '2025-12-18'),
(h1, 'Lisa C.', 'family', 3.5, 'Fine for families, gym closed?', 'Stayed for a family event. Rooms were comfortable enough. I tried to use the gym on our second day and it was closed for maintenance. No notice given at check-in. Disappointing.', '2024-09-14'),
(h1, 'Tom N.', 'business', 4.5, 'Top notch service', 'Concierge went above and beyond. Room was spotless. WiFi was excellent in my room — no complaints there. Did not use the gym this trip. Check-in was quick and professional.', '2026-02-03'),
(h1, 'Anna P.', 'solo', 4.0, 'Great location, decent rooms', 'Very walkable location. Clean rooms. The noise from the street was minimal — good soundproofing. WiFi was fine for browsing but I did notice it slowed during prime time. Overall a solid stay.', '2026-01-20'),
(h1, 'Kevin O.', 'business', 3.5, 'Mixed experience', 'Check-in was efficient and friendly. Room was comfortable. WiFi speed was completely inconsistent — fast one hour, crawling the next. For the price, I expect reliable business-grade connectivity.', '2025-09-30'),
(h1, 'Michelle R.', 'business', 5.0, 'Best business hotel in Seattle', 'Everything about this hotel is designed for the business traveler. Fast WiFi, great desk setup, responsive staff. Even the rooftop bar is perfect for client dinners. Cannot fault it.', '2026-02-10'),
(h1, 'Carlos D.', 'solo', 4.0, 'Nice stay overall', 'Pleasant hotel. Clean, modern, good location near Pike Place. I work remotely and the WiFi handled my video calls well during daytime. Evenings were slower. No major complaints.', '2026-01-05');

-- ── Oceanfront Miami Reviews (PARKING MISSING + CLEANLINESS CONFLICT) ─────────
INSERT INTO reviews (hotel_id, reviewer_name, traveler_persona, rating, review_title, review_text, acquisition_date) VALUES
(h2, 'Rachel G.', 'family', 5.0, 'Perfect family resort', 'Absolutely loved this place. The kids club was wonderful — our 6-year-old never wanted to leave. Room was spotless, housekeeping came twice daily. The beach was pristine. We will definitely return.', '2026-01-20'),
(h2, 'Daniel F.', 'couple', 4.5, 'Romantic beach getaway', 'Breathtaking ocean views from our balcony. The all-inclusive food was surprisingly good. Spa was excellent. Room was clean and beautifully decorated. Only minor issue was pool area got crowded by noon.', '2025-12-28'),
(h2, 'Susan M.', 'family', 2.0, 'Cleanliness issues ruined our trip', 'Very disappointed. Room was not properly cleaned — found used towels from previous guests and hairs in the shower. Reported to front desk but felt our complaint was dismissed. Beautiful location wasted by poor hygiene standards.', '2025-11-15'),
(h2, 'Brian K.', 'couple', 4.0, 'Great location, some issues', 'The beach access is incredible. Rooms were clean and modern. However we noticed some rust stains in the bathroom that were clearly not addressed during cleaning. Staff were friendly and responsive to other requests.', '2025-12-10'),
(h2, 'Natalie W.', 'family', 5.0, 'Kids loved every minute', 'The pool, the beach, the kids club — our children had the time of their lives. Room was immaculately clean. All-inclusive food was plentiful and tasty. Would highly recommend for families.', '2026-02-01'),
(h2, 'Eric S.', 'business', 3.5, 'Good but inconsistent', 'Beautiful property. I was here for a conference attached to the hotel. Rooms were lovely but I noticed my room was not properly serviced one day — towels not replaced, bed not made. When I flagged it, it was sorted immediately.', '2025-10-05'),
(h2, 'Amanda L.', 'couple', 5.0, 'Honeymoon perfection', 'We chose this for our honeymoon and it was magical. Spotless room, ocean view, romantic atmosphere. The staff surprised us with champagne and rose petals. Everything was perfect.', '2025-11-20'),
(h2, 'Peter C.', 'family', 4.0, 'Fun resort, minor cleanliness concerns', 'Overall a wonderful resort experience. Kids loved the pools. The beach was great. We did notice some mold in the corner of the bathroom ceiling — not terrible but worth mentioning. Reported it and staff offered to change our room.', '2025-12-20'),
(h2, 'Julia M.', 'solo', 4.5, 'Solo beach retreat', 'Came alone for a work break. The pool area is fantastic. Room was clean and fresh. Great cocktails at the beach bar. The all-inclusive option made everything easy. Highly recommended for solo travelers too.', '2026-01-10'),
(h2, 'Michael T.', 'couple', 4.0, 'Good overall, came by car', 'Drove from Fort Lauderdale. The hotel itself is beautiful. We could not find clear information about parking arrangements beforehand — eventually learned valet was available but pricey. Would have been nice to know in advance.', '2025-11-05'),
(h2, 'Sandra B.', 'family', 3.0, 'Below expectations on cleanliness', 'Paid a lot for this hotel and expected better. First room had stains on the carpet. They moved us to another room which was cleaner. The resort facilities are great but the cleanliness really needs attention.', '2025-10-18'),
(h2, 'Christopher A.', 'couple', 5.0, 'Perfect in every way', 'Impeccable service, pristine rooms, stunning beach. This is how luxury hospitality should be done. Cannot think of a single complaint. Our room was cleaned to a higher standard than our own home.', '2026-02-05'),
(h2, 'Heather N.', 'family', 4.5, 'Great kids club', 'The kids club is the star of this resort. Trained staff, engaging activities, very organized. Our room was large and clean. Breakfast buffet was outstanding. Only minor issue was slow elevator during busy checkout hours.', '2026-01-25'),
(h2, 'Ryan T.', 'car', 3.5, 'Nice resort, parking confusion', 'Beautiful property. Drove from Orlando — getting there was easy but we had no idea where to park when we arrived. The valet appeared eventually but there was no clear signage for self-parking. Hopefully this is improved.', '2025-09-22');

-- ── Budget Inn Portland Reviews (NOISE CONFLICT + VALUE CONFLICT) ─────────────
INSERT INTO reviews (hotel_id, reviewer_name, traveler_persona, rating, review_title, review_text, acquisition_date) VALUES
(h3, 'Greg H.', 'business', 4.0, 'Great for airport layovers', 'Exactly what you need for a long layover. Clean room, free breakfast, free shuttle. Quiet enough for a good sleep between flights. Staff were friendly at check-in.', '2026-01-08'),
(h3, 'Kelly P.', 'couple', 2.0, 'Terrible noise, thin walls', 'We could hear EVERYTHING from neighboring rooms — conversations, TV, even someone''s alarm at 4 AM. The walls are paper thin. Sleep was impossible. Not worth the money even at budget prices.', '2025-12-15'),
(h3, 'Frank D.', 'car', 4.5, 'Best value near PDX', 'Cannot beat this for the price. Free parking saved us a lot. Breakfast was decent — eggs, waffles, fruit. Room was clean. Quiet enough for our needs. Shuttle was on time. Highly recommend for road trippers.', '2026-02-01'),
(h3, 'Maria S.', 'solo', 3.5, 'Decent but noisy', 'The room was clean and the location was convenient for catching my flight. However, I could hear music from the room next door until midnight. I had earplugs thankfully. For a short stay it was acceptable.', '2025-11-22'),
(h3, 'Tom K.', 'business', 3.0, 'Good value but light sleepers beware', 'For the price, it is fair. Free breakfast and airport shuttle are great perks. But the soundproofing is poor — I heard my neighbors all night. If you sleep deeply, this is fine. Otherwise bring earplugs.', '2025-12-05'),
(h3, 'Emma L.', 'family', 4.0, 'Good budget option for families', 'Traveled with two young kids. Room was spacious enough for all of us. Free breakfast was a huge plus — kids loved the waffles. Noise was fine for us since the kids sleep through anything. Good value.', '2025-10-30'),
(h3, 'Nathan W.', 'car', 5.0, 'Hidden gem', 'I stay here every time I have a layover in Portland. Consistently clean, friendly staff, free parking, good breakfast. Perfect. The shuttle driver was incredibly helpful with directions.', '2026-01-30'),
(h3, 'Paula R.', 'solo', 2.5, 'Value not great for the quality', 'Expected more for the price. Room felt dated — carpet was worn and the shower had low pressure. Free breakfast was underwhelming. The airport shuttle was reliable though. Would look for alternatives next time.', '2025-11-10'),
(h3, 'John M.', 'business', 4.0, 'Perfect for quick work trips', 'Stayed two nights for meetings near the airport. Everything I needed — clean room, reliable WiFi, free breakfast, parking. Quiet enough for work calls during the day. Would stay again.', '2026-02-10'),
(h3, 'Cindy F.', 'couple', 3.0, 'Mixed experience', 'Pros: price, location, free breakfast, shuttle. Cons: noisy (heard street traffic and hallway noise all night), bathroom could be cleaner. It is what it is for this price point. Managed expectations.', '2025-12-28'),
(h3, 'Victor A.', 'car', 4.5, 'Great free parking — rare in Portland', 'Came by car from Seattle. The free parking alone justifies staying here. Room was fine, clean enough. Breakfast was good. Noise was not an issue for us. The value is hard to beat.', '2026-01-15');

-- ── Grand Palace Chicago Reviews (ACCESSIBILITY MISSING + BREAKFAST STALE) ───
INSERT INTO reviews (hotel_id, reviewer_name, traveler_persona, rating, review_title, review_text, acquisition_date) VALUES
(h4, 'Victoria P.', 'couple', 5.0, 'The pinnacle of Chicago luxury', 'Every detail was flawless. The room was breathtaking — fresh flowers, impeccably made bed, marble bathroom. The Michelin restaurant exceeded expectations. Butler service was extraordinary. Worth every penny.', '2026-02-14'),
(h4, 'Richard B.', 'business', 5.0, 'Unmatched corporate hospitality', 'Host large client events here twice a year. The meeting rooms are world-class. Guest rooms are immaculate. Service is proactive and anticipatory. The concierge arranged everything flawlessly. This is the gold standard.', '2026-01-20'),
(h4, 'Eleanor M.', 'couple', 4.5, 'Anniversary stay — almost perfect', 'Celebrated our 20th anniversary. The room was stunning with lake views. Staff treated us like royalty. The spa was exceptional. The only reason for 4 stars: the breakfast menu has not changed in years — could use refreshing.', '2025-12-25'),
(h4, 'George K.', 'business', 5.0, 'Chicago''s finest', 'I have stayed in fine hotels globally and this rivals the best. Rooms are large, impeccably maintained. WiFi is fast. Staff remember your name. The restaurant is extraordinary. Cannot recommend highly enough.', '2026-02-01'),
(h4, 'Anne D.', 'accessibility', 4.0, 'Beautiful hotel, accessibility questions', 'Stunning property. I use a wheelchair and had an accessible room which was wonderful. However, the process to request accessible features in advance was unclear. I had to call multiple times. Once there, the room itself was excellent.', '2025-11-18'),
(h4, 'Thomas A.', 'couple', 5.0, 'Simply extraordinary', 'The Grand Palace lives up to its name. The architecture, the art, the service — all extraordinary. Room was spotless. Breakfast was delicious though the menu has been the same for a while. Minor note for a 5-star experience.', '2026-01-05'),
(h4, 'Martha C.', 'family', 4.5, 'Luxury family experience', 'Brought the family for a special occasion. The suite was magnificent — room for everyone. Kids were given special welcome gifts. Housekeeping was thorough. Breakfast was wonderful. Parking was valet only but efficient.', '2025-12-18'),
(h4, 'William N.', 'business', 5.0, 'Exemplary in every way', 'My 12th stay. Consistently exceptional. The rooms are always perfectly prepared. Service never falters. The gym is outstanding. Spa is world class. This hotel simply does not make mistakes.', '2026-02-08'),
(h4, 'Sandra L.', 'couple', 4.0, 'Almost perfect', 'Beautiful hotel. The room was stunning and the service was excellent. My only feedback: the breakfast has not evolved — same menu as two years ago when we last visited. For a hotel of this caliber, I expected more creativity.', '2025-10-05'),
(h4, 'Henry T.', 'business', 5.0, 'The best in Chicago, full stop', 'If you are looking for the finest hotel experience in Chicago, look no further. Every metric — cleanliness, service, food, ambiance — is at the absolute top. The business center is superb. My go-to for important stays.', '2026-01-28'),
(h4, 'Patricia W.', 'accessibility', 3.5, 'Beautiful property, accessibility improvements needed', 'The hotel is gorgeous. However I found navigating it with my mobility device somewhat difficult — some pathways between restaurants and the pool were narrow. Staff were very helpful but the physical layout could be improved.', '2024-08-20'),
(h4, 'James O.', 'couple', 5.0, 'Flawless in every way', 'We come here for every special occasion. The attention to detail is extraordinary — they remember we prefer extra pillows, our preferred sparkling water brand, everything. This is what 5-star truly means.', '2026-02-05');

-- ── Cozy Inn Austin Reviews (SERVICE CONFLICT + CHECKIN STALE) ───────────────
INSERT INTO reviews (hotel_id, reviewer_name, traveler_persona, rating, review_title, review_text, acquisition_date) VALUES
(h5, 'Zoe T.', 'solo', 5.0, 'Best boutique hotel in Austin', 'The rooftop bar is worth the stay alone. Incredible local art throughout the hotel. Staff (through the virtual system) were super responsive. The bike rentals were a highlight — I explored the whole city.', '2026-01-15'),
(h5, 'Alex N.', 'couple', 2.0, 'Virtual check-in is a disaster', 'The app-based check-in failed completely. The code did not work and there was no one to call. Stood outside for 45 minutes before finally reaching someone via email. Ruined our first night. Nice room, terrible arrival experience.', '2025-12-20'),
(h5, 'Bella R.', 'solo', 4.5, 'Quirky and wonderful', 'Exactly the kind of unique place I was looking for. The local art is fascinating, rooftop bar is lively, WiFi was excellent for remote work. The keyless entry worked perfectly. A bit noisy from Sixth Street but expected.', '2026-02-08'),
(h5, 'Chris L.', 'couple', 4.0, 'Fun and charming', 'Loved the vibe. The rooftop bar was amazing — live music, great cocktails. Room was cozy and clean. Check-in app worked well for us. Only downside: street noise from live music venues until 2 AM.', '2025-11-28'),
(h5, 'Dana M.', 'solo', 3.0, 'Check-in was a nightmare', 'The concept is cool but execution of the virtual check-in is poor. Had issues with the app, waited an hour to get a human response. Once in the room, everything was great. But that first impression matters a lot.', '2025-10-15'),
(h5, 'Evan K.', 'couple', 5.0, 'Perfect Austin experience', 'If you want to feel the real Austin vibe, stay here. The rooftop bar is legendary. Staff were incredibly helpful via the app — any request answered within minutes. Room was spotless. Will be back.', '2026-01-25'),
(h5, 'Fiona W.', 'solo', 4.0, 'Great for music lovers', 'Sixth Street is right there — exactly why I chose this hotel. The noise is part of the experience. WiFi was strong and fast. Check-in app worked fine. The rooftop bar at sunset was magical.', '2026-02-15'),
(h5, 'Gavin O.', 'couple', 3.5, 'Good hotel, app issues', 'Nice boutique hotel with great character. However the digital check-in process is not fully reliable — our code expired before we arrived and we had to wait for a manual reset. Staff via app were apologetic and quick to fix it.', '2025-09-08'),
(h5, 'Hannah P.', 'solo', 5.0, 'My new Austin home base', 'Stayed three nights for a conference. WiFi was perfect for video calls. Check-in app worked flawlessly. Rooftop bar became my nightly ritual. The bike rental let me explore neighborhoods I would have missed otherwise.', '2026-01-10'),
(h5, 'Ivan B.', 'couple', 4.0, 'Unique and fun', 'Really enjoyed the local art theme. The rooftop bar is a highlight. We had a small issue with the check-in app timing out but the virtual support team sorted it quickly. Room was clean and cozy. Great value for Austin.', '2025-12-05'),
(h5, 'Julia M.', 'solo', 2.5, 'Concept better than execution', 'Love the idea of this hotel. The art, the rooftop, the local vibe — all great on paper. But the app check-in failed for me and the virtual concierge took hours to respond late at night. Left feeling frustrated.', '2025-11-01'),
(h5, 'Kyle S.', 'couple', 4.5, 'Loved every minute', 'Fantastic boutique hotel. Check-in was smooth and fast via the app. The rooftop bar has incredible sunset views. Room was clean and had a great Austin feel. The noise from Sixth Street is loud but we loved it.', '2026-02-20');

END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE REVIEW COUNTS
-- ════════════════════════════════════════════════════════════════════════════
UPDATE hotels SET review_count = (SELECT COUNT(*) FROM reviews WHERE hotel_id = hotels.id);

-- ════════════════════════════════════════════════════════════════════════════
-- PRE-SEEDED QUESTIONS (gap analysis results, for immediate demo)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE h1 UUID; h2 UUID; h3 UUID; h4 UUID; h5 UUID;
BEGIN
    SELECT id INTO h1 FROM hotels WHERE slug = 'the-meridian-seattle';
    SELECT id INTO h2 FROM hotels WHERE slug = 'oceanfront-suites-miami';
    SELECT id INTO h3 FROM hotels WHERE slug = 'budget-inn-express-portland';
    SELECT id INTO h4 FROM hotels WHERE slug = 'the-grand-palace-chicago';
    SELECT id INTO h5 FROM hotels WHERE slug = 'cozy-inn-austin';

    -- Meridian Seattle: WiFi CONFLICT + GYM STALE
    INSERT INTO questions (hotel_id, topic, gap_type, question_text, target_personas, confidence_score) VALUES
    (h1, 'wifi', 'conflicting', 'We''ve noticed very mixed reports on Wi-Fi speed here — some guests say it''s excellent, others say it drops constantly. Was it reliable enough for video calls during your stay?', ARRAY['business','solo'], 0.88),
    (h1, 'gym', 'stale', 'The fitness center hasn''t been reviewed in several months — is it currently open and in good working condition?', ARRAY['business','solo','couple'], 0.72),
    (h1, 'parking', 'missing', 'Parking hasn''t come up much in reviews — did you drive, and if so, how was the parking experience?', ARRAY['car'], 0.65);

    -- Oceanfront Miami: PARKING MISSING + CLEANLINESS CONFLICT
    INSERT INTO questions (hotel_id, topic, gap_type, question_text, target_personas, confidence_score) VALUES
    (h2, 'cleanliness', 'conflicting', 'We''ve seen conflicting reviews about cleanliness — some guests found the rooms spotless, others reported issues. How was the cleanliness during your stay?', ARRAY['family','couple'], 0.85),
    (h2, 'parking', 'missing', 'Parking is rarely mentioned in reviews here — did you arrive by car, and if so, how was the parking situation?', ARRAY['car'], 0.78),
    (h2, 'breakfast', 'missing', 'Breakfast details are unclear from reviews — is it included in the rate, and is it worth it?', ARRAY['family','couple'], 0.60);

    -- Budget Inn Portland: NOISE CONFLICT + VALUE CONFLICT
    INSERT INTO questions (hotel_id, topic, gap_type, question_text, target_personas, confidence_score) VALUES
    (h3, 'noise', 'conflicting', 'Noise level reports vary widely here — some guests slept perfectly, others were kept awake. How was it for you?', ARRAY['business','solo','couple'], 0.82),
    (h3, 'value', 'conflicting', 'Some guests feel this is great value, others think it''s not worth the price. Would you say the quality matched what you paid?', ARRAY['business','solo','family','couple'], 0.75),
    (h3, 'wifi', 'missing', 'WiFi is rarely discussed in reviews — how reliable was it for your needs?', ARRAY['business','solo'], 0.55);

    -- Grand Palace Chicago: ACCESSIBILITY MISSING + BREAKFAST STALE
    INSERT INTO questions (hotel_id, topic, gap_type, question_text, target_personas, confidence_score) VALUES
    (h4, 'accessibility', 'missing', 'Accessibility features are rarely discussed in reviews — how well does the hotel accommodate guests with mobility needs?', ARRAY['accessibility'], 0.80),
    (h4, 'breakfast', 'stale', 'The breakfast has not been reviewed recently — is the menu still varied and high quality?', ARRAY['couple','business','family'], 0.70),
    (h4, 'gym', 'periodic', 'Just checking in: is the fitness center still well-maintained and fully equipped?', ARRAY['business','solo'], 0.55);

    -- Cozy Inn Austin: CHECKIN STALE + SERVICE CONFLICT
    INSERT INTO questions (hotel_id, topic, gap_type, question_text, target_personas, confidence_score) VALUES
    (h5, 'checkin', 'conflicting', 'The app-based check-in has been a point of frustration for some guests and worked perfectly for others — how was it for you?', ARRAY['solo','couple'], 0.88),
    (h5, 'noise', 'missing', 'Being near Sixth Street, noise is expected — but how loud was it actually, and did it affect your sleep?', ARRAY['solo','couple'], 0.72),
    (h5, 'wifi', 'missing', 'WiFi is important for remote workers who stay here — was it reliable and fast enough?', ARRAY['business','solo'], 0.60);

END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
SELECT 'hotels' as table_name, COUNT(*) as rows FROM hotels
UNION ALL SELECT 'reviews', COUNT(*) FROM reviews
UNION ALL SELECT 'rooms', COUNT(*) FROM rooms
UNION ALL SELECT 'questions', COUNT(*) FROM questions;
