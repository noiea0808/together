-- 관리자 화면에서 전체 사용자 목록을 조회/관리(관리자 지정)할 수 있도록 users 테이블 RLS 확장
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
-- 전제: add_admin_role.sql 을 먼저 실행해 app_is_admin() 함수가 존재해야 합니다.
--
-- 기존 "users_select_sharedpot" 정책(본인 또는 같은 밥팟 참여자만 조회 가능)은 그대로 두고,
-- 관리자에게만 적용되는 정책을 추가한다. Postgres RLS는 같은 command(SELECT/UPDATE)에 대해
-- 여러 permissive 정책을 OR로 합치므로, 기존 사용자 조회 동작에는 영향이 없다.

-- ── 관리자는 모든 사용자 행을 조회할 수 있다 ──────────
DROP POLICY IF EXISTS "users_select_admin" ON users;
CREATE POLICY "users_select_admin" ON users
  FOR SELECT TO authenticated
  USING (public.app_is_admin());

-- ── 관리자는 사용자 행을 수정할 수 있다 (관리자 지정/해제 토글용) ──
DROP POLICY IF EXISTS "users_update_admin" ON users;
CREATE POLICY "users_update_admin" ON users
  FOR UPDATE TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- ── 관리자는 전체 사용자의 약관 동의 이력을 조회할 수 있다 ──
-- (기존 "agreements_select_own" 정책은 본인 것만 허용 — 관리자용 정책을 추가로 얹는다)
DROP POLICY IF EXISTS "agreements_select_admin" ON user_term_agreements;
CREATE POLICY "agreements_select_admin" ON user_term_agreements
  FOR SELECT TO authenticated
  USING (public.app_is_admin());
