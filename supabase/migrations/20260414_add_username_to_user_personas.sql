ALTER TABLE "User_Personas"
    ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE "User_Personas"
SET username = COALESCE(NULLIF(username, ''), 'user_' || LEFT(REPLACE(user_id::text, '-', ''), 8))
WHERE username IS NULL OR username = '';

ALTER TABLE "User_Personas"
    ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_personas_username_lower_idx
    ON "User_Personas"(LOWER(username));
