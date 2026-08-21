-- 밥팟 '모먼트' 공유 기능
-- 종료된 밥팟의 사진/코멘트를 그룹 전체에 공개하는 share_moment 플래그 + RLS 확장.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE meal_pots ADD COLUMN IF NOT EXISTS share_moment BOOLEAN NOT NULL DEFAULT false;

-- pot_comments / pot_photos: 기존엔 "내가 참여 중인 밥팟"만 조회 가능했는데,
-- share_moment = true 인 밥팟은 같은 그룹 멤버 전체가 조회할 수 있도록 OR 조건 추가.
-- (app_my_group_ids() 는 add_group_invite_notifications.sql 에서 만든 헬퍼)
-- INSERT/DELETE(작성/삭제) 정책은 변경하지 않음 — 여전히 밥팟 참여자 본인만 가능.
DROP POLICY IF EXISTS "pot_comments_select_member" ON pot_comments;
CREATE POLICY "pot_comments_select_member" ON pot_comments
  FOR SELECT TO authenticated
  USING (
    pot_id IN (SELECT public.app_my_pot_ids())
    OR pot_id IN (
      SELECT id FROM meal_pots
      WHERE share_moment = true
      AND group_id IN (SELECT public.app_my_group_ids())
    )
  );

DROP POLICY IF EXISTS "pot_photos_select_member" ON pot_photos;
CREATE POLICY "pot_photos_select_member" ON pot_photos
  FOR SELECT TO authenticated
  USING (
    pot_id IN (SELECT public.app_my_pot_ids())
    OR pot_id IN (
      SELECT id FROM meal_pots
      WHERE share_moment = true
      AND group_id IN (SELECT public.app_my_group_ids())
    )
  );
