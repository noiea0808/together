-- 점심 상태 미설정 리마인드 알림 — 어드민 전역 설정 + 공휴일 관리
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
-- app_is_admin()은 add_admin_role.sql에서 이미 생성됨.

-- ── 1. 리마인드 전역 설정 (싱글턴 테이블) ──────────────
CREATE TABLE IF NOT EXISTS lunch_reminder_config (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  enabled BOOLEAN NOT NULL DEFAULT true,
  send_time TIME NOT NULL DEFAULT '09:30',
  last_sent_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO lunch_reminder_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE lunch_reminder_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lunch_reminder_config_admin" ON lunch_reminder_config;
CREATE POLICY "lunch_reminder_config_admin" ON lunch_reminder_config
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());
-- service_role(Edge Function)은 RLS를 우회하므로 별도 정책 불필요.

-- ── 2. 공휴일 목록 ──────────────────────────────────
CREATE TABLE IF NOT EXISTS holidays (
  date DATE PRIMARY KEY,
  name TEXT NOT NULL
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "holidays_admin" ON holidays;
CREATE POLICY "holidays_admin" ON holidays
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());
