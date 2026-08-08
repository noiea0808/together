-- 네이티브 앱(FCM) 푸시 토큰 저장 테이블
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fcm_tokens_user_id_idx ON fcm_tokens(user_id);

ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fcm_tokens_insert_own" ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_select_own" ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_update_own" ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_delete_own" ON fcm_tokens;

-- 본인 토큰만 등록(신규 기기)/조회/갱신(upsert)/삭제(알림 끄기·로그아웃) 가능
-- app_current_user_id() 는 add_guest_support.sql 에서 만든 헬퍼 (auth.uid() -> users.id)
CREATE POLICY "fcm_tokens_insert_own" ON fcm_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.app_current_user_id());

CREATE POLICY "fcm_tokens_select_own" ON fcm_tokens
  FOR SELECT TO authenticated
  USING (user_id = public.app_current_user_id());

CREATE POLICY "fcm_tokens_update_own" ON fcm_tokens
  FOR UPDATE TO authenticated
  USING (user_id = public.app_current_user_id())
  WITH CHECK (user_id = public.app_current_user_id());

CREATE POLICY "fcm_tokens_delete_own" ON fcm_tokens
  FOR DELETE TO authenticated
  USING (user_id = public.app_current_user_id());
