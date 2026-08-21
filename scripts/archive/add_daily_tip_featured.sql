-- 오늘의 팁 별표(우선 노출) 기능 — 별표 팁은 랜덤 노출 시 가중치 2배를 받는다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE daily_tips ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;
