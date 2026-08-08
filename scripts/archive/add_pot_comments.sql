-- 밥팟 코멘트 기능
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE TABLE IF NOT EXISTS pot_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id UUID NOT NULL REFERENCES meal_pots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pot_comments_pot_id_idx ON pot_comments(pot_id);

ALTER TABLE pot_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pot_comments_select_member" ON pot_comments;
DROP POLICY IF EXISTS "pot_comments_insert_own" ON pot_comments;
DROP POLICY IF EXISTS "pot_comments_delete_own" ON pot_comments;

-- 내가 참여한 밥팟의 코멘트만 조회 가능
-- app_my_pot_ids() 는 add_guest_support.sql 에서 만든 헬퍼 (내가 속한 pot_id 목록)
CREATE POLICY "pot_comments_select_member" ON pot_comments
  FOR SELECT TO authenticated
  USING (pot_id IN (SELECT public.app_my_pot_ids()));

-- 내가 참여한 밥팟에, 본인 명의로만 작성 가능
CREATE POLICY "pot_comments_insert_own" ON pot_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.app_current_user_id()
    AND pot_id IN (SELECT public.app_my_pot_ids())
  );

-- 본인 코멘트만 삭제 가능
CREATE POLICY "pot_comments_delete_own" ON pot_comments
  FOR DELETE TO authenticated
  USING (user_id = public.app_current_user_id());
