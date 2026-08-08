-- 점심 상태 리마인드 알림 문구를 어드민에서 편집할 수 있도록 컬럼 추가
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE lunch_reminder_config ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '오늘 점심 뭐 드실래요?';
ALTER TABLE lunch_reminder_config ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '아직 점심 상태를 안 정하셨어요. 지금 정해두면 눈치 안 봐도 돼요.';
