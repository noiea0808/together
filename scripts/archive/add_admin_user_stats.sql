-- 어드민 > 사용자 목록에 "최근 로그인"과 "참여했던 밥팟 수"를 표시하기 위한 준비
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
-- 전제: add_admin_role.sql, add_admin_users_management.sql 을 먼저 실행해 app_is_admin() 이 존재해야 합니다.

-- ── 1. 최근 로그인 시각 컬럼 추가 ──────────────────────
-- 앱이 세션을 확인할 때마다(getSessionUser) 본인 행에 이 값을 갱신한다.
-- 본인 행 UPDATE는 기존 정책(is_discoverable, notify_lunch_reminder 등과 동일)으로 이미 허용되어 있어
-- 별도 RLS 추가가 필요 없다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- ── 2. 관리자가 전체 사용자의 밥팟 참여 수를 집계할 수 있도록 pot_members 조회 허용 ──
-- 기존 pot_members 조회 정책(같은 팟 참여자만 조회 가능)은 그대로 두고, 관리자 전용 정책을 추가한다.
DROP POLICY IF EXISTS "pot_members_select_admin" ON pot_members;
CREATE POLICY "pot_members_select_admin" ON pot_members
  FOR SELECT TO authenticated
  USING (public.app_is_admin());
