-- 신고/제재 기능
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

-- ── 1. users 테이블에 정지 관련 컬럼 추가 ──────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- ── 2. reports 테이블 ──────────────────────────────────
-- target_type 별로 target_id 가 가리키는 테이블이 달라진다 (모먼트=밥팟이므로 meal_pots).
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('pot', 'pot_comment', 'wish_place', 'wish_place_comment', 'user')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  action_taken TEXT
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status);
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports(target_type, target_id);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_insert_own" ON reports;
DROP POLICY IF EXISTS "reports_select_own_or_admin" ON reports;
DROP POLICY IF EXISTS "reports_update_admin" ON reports;

-- 본인 명의로만 신고 접수 가능
CREATE POLICY "reports_insert_own" ON reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = public.app_current_user_id());

-- 본인이 접수한 신고 또는 관리자만 조회 가능
CREATE POLICY "reports_select_own_or_admin" ON reports
  FOR SELECT TO authenticated
  USING (reporter_id = public.app_current_user_id() OR public.app_is_admin());

-- 처리(상태 변경)는 관리자만 가능
CREATE POLICY "reports_update_admin" ON reports
  FOR UPDATE TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());
