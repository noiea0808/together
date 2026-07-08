-- 웹 푸시 구독 정보 저장 테이블
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_insert_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_select_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_update_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_delete_own" ON push_subscriptions;

-- 본인 구독만 등록(신규 기기)/조회/갱신(upsert)/삭제(알림 끄기) 가능
-- app_current_user_id() 는 add_guest_support.sql 에서 만든 헬퍼 (auth.uid() -> users.id)
CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.app_current_user_id());

CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = public.app_current_user_id());

CREATE POLICY "push_subscriptions_update_own" ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = public.app_current_user_id())
  WITH CHECK (user_id = public.app_current_user_id());

CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = public.app_current_user_id());
