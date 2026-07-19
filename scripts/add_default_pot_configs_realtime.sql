-- 기본 밥팟 설정 변경이 다른 기기에도 실시간으로 반영되도록 Realtime 퍼블리케이션에 추가
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE group_default_pot_configs;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
