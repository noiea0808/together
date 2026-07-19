-- 점심 상태 미설정 리마인드 알림 — 사용자별 opt-in 컬럼
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_lunch_reminder BOOLEAN NOT NULL DEFAULT true;
