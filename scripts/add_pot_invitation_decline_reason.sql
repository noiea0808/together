-- 제안 거절 시 사유(코멘트)를 남길 수 있도록 컬럼 추가
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE pot_invitations ADD COLUMN IF NOT EXISTS decline_reason TEXT;

-- 거절 시 발신자에게 거절 알림을 보낼 수 있도록 허용 (수신자 → 발신자 방향 알림 insert)
DROP POLICY IF EXISTS "notifications_insert_invitation_decline" ON notifications;

CREATE POLICY "notifications_insert_invitation_decline" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    invitation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pot_invitations pi
      WHERE pi.id = notifications.invitation_id
        AND pi.to_user_id = public.app_current_user_id()
        AND pi.from_user_id = notifications.user_id
    )
  );
