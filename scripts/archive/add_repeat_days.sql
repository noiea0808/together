-- 기본 밥팟이 적용될 요일을 그룹장이 고를 수 있도록 repeat_days 컬럼을 추가한다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
-- 요일 값은 JS Date.getDay() 규칙(0=일 ~ 6=토)을 따른다. 모든 요일 선택 가능(토/일 포함).
-- 기본값은 평일(월~금) 전체.

ALTER TABLE group_default_pot_configs
  ADD COLUMN IF NOT EXISTS repeat_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}';

ALTER TABLE group_default_pot_configs DROP CONSTRAINT IF EXISTS group_default_pot_configs_repeat_days_check;
ALTER TABLE group_default_pot_configs ADD CONSTRAINT group_default_pot_configs_repeat_days_check
  CHECK (
    array_length(repeat_days, 1) > 0
    AND repeat_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]
  );
