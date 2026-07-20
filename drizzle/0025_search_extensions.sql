-- Custom SQL migration file, put your code below! --

-- Enables accent/case-insensitive substring matching (unaccent) and
-- trigram-based fuzzy relevance ranking (pg_trgm) for the Command Center's
-- Search Engine (src/lib/search/). Neon allows extension creation for the
-- database owner role; both are already applied to the shared dev/prod
-- instance used this session — this migration just makes that reproducible.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
