-- meal_pots 테이블에 밥팟 초대코드 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE meal_pots
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- 기존 일반 팟에 코드 소급 발급 (기본팟 제외)
UPDATE meal_pots
SET invite_code = upper(
  substring(md5(random()::text), 1, 6)
)
WHERE invite_code IS NULL
  AND is_default = false;
