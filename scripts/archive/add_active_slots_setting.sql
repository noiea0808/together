-- 사용자가 메인 화면에서 실제로 쓰는 슬롯만 남기고 나머지는 숨길 수 있게, 사용자별로
-- "사용 중인 슬롯" 목록을 저장한다. 기본값은 6개 전부 — 기존 사용자는 지금과 동일하게 보인다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_slots TEXT[] NOT NULL
  DEFAULT ARRAY['아침','오전간식','점심','오후간식','저녁','야식'];
