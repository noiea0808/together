-- 오늘 화면 "친구 보기"에서 그룹 없는 친구에게 "같이 먹자" 제안 → 그룹에 속하지 않는(group_id NULL)
-- 2인 밥팟 생성을 지원한다. 기존 제안(add_pot_invitations.sql)은 같은 그룹 멤버 사이만 가능해서,
-- 친구 사이의 제안을 별도 정책으로 추가한다(기존 정책은 그대로 두고 OR로 넓히는 방식).
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

-- 1) pot_invitations.group_id를 nullable로 변경 — 친구 제안은 그룹이 없다.
ALTER TABLE pot_invitations ALTER COLUMN group_id DROP NOT NULL;

-- 2) 친구 사이(group_id IS NULL) 제안 INSERT 허용 — 기존 "같은 그룹" 정책과 별개로 추가.
DROP POLICY IF EXISTS "pot_invitations_insert_friend" ON pot_invitations;
CREATE POLICY "pot_invitations_insert_friend" ON pot_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    from_user_id = public.app_current_user_id()
    AND group_id IS NULL
    AND EXISTS (
      SELECT 1 FROM friend_requests fr
      WHERE fr.status = 'accepted'
        AND ((fr.from_user_id = pot_invitations.from_user_id AND fr.to_user_id = pot_invitations.to_user_id)
          OR (fr.from_user_id = pot_invitations.to_user_id AND fr.to_user_id = pot_invitations.from_user_id))
    )
  );

-- 3) meal_pots INSERT: group_id가 없는 밥팟(친구 제안 수락 시 acceptPotInvitation이 생성) 허용.
-- meal_pots는 이미 SELECT가 전체 공개(add_guest_support.sql: meal_pots_select_authenticated)이고
-- pot_members INSERT도 "본인 행"만 확인할 뿐 그룹/생성자 일치를 요구하지 않으므로(pot_members_insert_own),
-- 같은 수준으로 group_id IS NULL인 밥팟 생성만 열어준다(그룹 소속 밥팟은 기존 정책 그대로 유지).
DROP POLICY IF EXISTS "meal_pots_insert_no_group" ON meal_pots;
CREATE POLICY "meal_pots_insert_no_group" ON meal_pots
  FOR INSERT TO authenticated
  WITH CHECK (group_id IS NULL);
