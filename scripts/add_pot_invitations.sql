-- 대상 지정 초대: "제안" 상태의 밥팟 초대 (수락 시점에 밥팟 생성)
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE TABLE IF NOT EXISTS pot_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  slot TEXT NOT NULL,
  meal_time TIME,
  title TEXT,
  menu TEXT,
  max_people INT NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'pending',
  pot_id UUID REFERENCES meal_pots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pot_invitations_to_user_status_idx ON pot_invitations(to_user_id, status);
CREATE INDEX IF NOT EXISTS pot_invitations_from_user_date_idx ON pot_invitations(from_user_id, date);

ALTER TABLE pot_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pot_invitations_select_party" ON pot_invitations;
DROP POLICY IF EXISTS "pot_invitations_insert_sharedgroup" ON pot_invitations;
DROP POLICY IF EXISTS "pot_invitations_update_party" ON pot_invitations;

-- 양쪽 당사자만 조회 가능
CREATE POLICY "pot_invitations_select_party" ON pot_invitations
  FOR SELECT TO authenticated
  USING (from_user_id = public.app_current_user_id() OR to_user_id = public.app_current_user_id());

-- 본인이 발신자이고, 발신자·수신자 모두 해당 그룹 멤버일 때만 생성 가능
CREATE POLICY "pot_invitations_insert_sharedgroup" ON pot_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    from_user_id = public.app_current_user_id()
    AND EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = pot_invitations.group_id AND gm.user_id = pot_invitations.from_user_id)
    AND EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = pot_invitations.group_id AND gm.user_id = pot_invitations.to_user_id)
  );

-- 양쪽 당사자만 상태 변경 가능 (수신자: 수락/거절, 발신자: 취소 등)
CREATE POLICY "pot_invitations_update_party" ON pot_invitations
  FOR UPDATE TO authenticated
  USING (from_user_id = public.app_current_user_id() OR to_user_id = public.app_current_user_id())
  WITH CHECK (from_user_id = public.app_current_user_id() OR to_user_id = public.app_current_user_id());

-- ── notifications 연동 ──────────────────────────────
-- 밥팟이 아직 없는 "제안" 알림을 담기 위한 컬럼 (pot_id는 NULL로 둠)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS invitation_id UUID REFERENCES pot_invitations(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "notifications_insert_invitation" ON notifications;

-- pot_id가 없는 제안 알림은 기존 notifications_insert_sharedpot 정책을 통과하지 못하므로 별도 허용
CREATE POLICY "notifications_insert_invitation" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    invitation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pot_invitations pi
      WHERE pi.id = notifications.invitation_id
        AND pi.from_user_id = public.app_current_user_id()
        AND pi.to_user_id = notifications.user_id
    )
  );
