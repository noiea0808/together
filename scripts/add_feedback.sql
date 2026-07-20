-- 사용자 의견 접수 (1회성 답변 티켓)
-- 사용자가 의견을 남기면 관리자만 확인/답변할 수 있고, 답변이 달리면 사용자에게 알림을 보낸다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reply TEXT,
  replied_at TIMESTAMPTZ,
  replied_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback(status);
CREATE INDEX IF NOT EXISTS feedback_user_id_idx ON feedback(user_id);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_insert_own" ON feedback;
DROP POLICY IF EXISTS "feedback_select_own_or_admin" ON feedback;
DROP POLICY IF EXISTS "feedback_update_admin" ON feedback;

-- 본인 명의로만 접수 가능
CREATE POLICY "feedback_insert_own" ON feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.app_current_user_id());

-- 본인이 접수한 의견 또는 관리자만 조회 가능
CREATE POLICY "feedback_select_own_or_admin" ON feedback
  FOR SELECT TO authenticated
  USING (user_id = public.app_current_user_id() OR public.app_is_admin());

-- 답변(상태 변경)은 관리자만 가능
CREATE POLICY "feedback_update_admin" ON feedback
  FOR UPDATE TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- 관리자가 답변할 때 해당 사용자에게 알림(종 아이콘 + 푸시)을 남길 수 있도록 허용
-- (기존 notifications INSERT 정책들은 전부 "같은 밥팟/그룹 멤버"처럼 상황별 제한이라 관리자용을 별도로 추가한다)
DROP POLICY IF EXISTS "notifications_insert_admin" ON notifications;
CREATE POLICY "notifications_insert_admin" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.app_is_admin());
