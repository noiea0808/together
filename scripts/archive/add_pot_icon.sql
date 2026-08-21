-- 밥팟 카드 왼쪽 썸네일을 사용자가 직접 고를 수 있도록 icon 컬럼을 추가한다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
-- 값 목록은 src/lib/potConstants.js의 POT_ICON_KEYS와 반드시 일치해야 한다.

ALTER TABLE meal_pots ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE meal_pots DROP CONSTRAINT IF EXISTS meal_pots_icon_check;
ALTER TABLE meal_pots ADD CONSTRAINT meal_pots_icon_check
  CHECK (icon IS NULL OR icon IN ('together', 'tray', 'chat', 'salad', 'ready', 'party', 'care', 'map', 'delivery', 'random'));

ALTER TABLE group_default_pot_configs ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE group_default_pot_configs DROP CONSTRAINT IF EXISTS group_default_pot_configs_icon_check;
ALTER TABLE group_default_pot_configs ADD CONSTRAINT group_default_pot_configs_icon_check
  CHECK (icon IS NULL OR icon IN ('together', 'tray', 'chat', 'salad', 'ready', 'party', 'care', 'map', 'delivery', 'random'));
