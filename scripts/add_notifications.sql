-- 인앱 알림함 (푸시로 보낸 내역을 화면에서도 조회할 수 있도록 저장)
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pot_id UUID REFERENCES meal_pots(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 이벤트 종류 (join/leave/update/comment) — 이미 테이블이 있던 경우를 위해 별도 추가
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_type TEXT;

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx ON notifications(user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
DROP POLICY IF EXISTS "notifications_insert_sharedpot" ON notifications;

-- 본인 알림만 조회 가능
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = public.app_current_user_id());

-- 본인 알림만 수정 가능 (읽음 처리)
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = public.app_current_user_id())
  WITH CHECK (user_id = public.app_current_user_id());

-- 같은 밥팟 멤버에게만 알림 생성 가능 (참여/나가기/수정/코멘트 이벤트 발생 시)
-- app_my_pot_ids() 는 add_guest_support.sql 에서 만든 헬퍼 (내가 속한 pot_id 목록)
CREATE POLICY "notifications_insert_sharedpot" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (pot_id IN (SELECT public.app_my_pot_ids()));

-- 종 아이콘 배지 실시간 반영을 위해 Realtime 퍼블리케이션에 추가 (이미 추가돼 있으면 무시)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
