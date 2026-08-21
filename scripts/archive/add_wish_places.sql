-- 가고 싶은 식당 리스트 (내 계정 > 가고 싶은데...)
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE TABLE IF NOT EXISTS wish_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wish_places_user_id_idx ON wish_places(user_id, sort_order);

ALTER TABLE wish_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wish_places_select_own" ON wish_places;
DROP POLICY IF EXISTS "wish_places_insert_own" ON wish_places;
DROP POLICY IF EXISTS "wish_places_update_own" ON wish_places;
DROP POLICY IF EXISTS "wish_places_delete_own" ON wish_places;

-- 지금은 본인 것만 조회/작성 가능. 친구 공유 기능은 이 테이블을 그대로 두고
-- 추후 별도 공유 테이블(예: wish_place_shares)을 얹어 확장할 예정.
CREATE POLICY "wish_places_select_own" ON wish_places
  FOR SELECT TO authenticated
  USING (user_id = public.app_current_user_id());

CREATE POLICY "wish_places_insert_own" ON wish_places
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.app_current_user_id());

CREATE POLICY "wish_places_update_own" ON wish_places
  FOR UPDATE TO authenticated
  USING (user_id = public.app_current_user_id());

CREATE POLICY "wish_places_delete_own" ON wish_places
  FOR DELETE TO authenticated
  USING (user_id = public.app_current_user_id());
