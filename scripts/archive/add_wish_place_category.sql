-- 가고 싶은 곳 항목을 좋아하는 곳/궁금한 곳/같이 가고 싶은 곳/자주 가는 곳으로 구분하기 위해
-- category 컬럼을 추가한다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE wish_places
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'like';

ALTER TABLE wish_places DROP CONSTRAINT IF EXISTS wish_places_category_check;
ALTER TABLE wish_places ADD CONSTRAINT wish_places_category_check
  CHECK (category IN ('like', 'curious', 'together', 'frequent'));
