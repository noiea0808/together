-- 관리자 권한 도입: 약관(terms) 쓰기 작업을 관리자에게만 허용
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

-- ── 1. users 테이블에 관리자 플래그 추가 ──────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- ── 2. RLS 재귀 방지용 헬퍼 함수 (SECURITY DEFINER → RLS 우회) ──
-- add_guest_support.sql 의 app_current_user_id() 와 같은 패턴.
CREATE OR REPLACE FUNCTION public.app_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.users WHERE auth_id = auth.uid()), false)
$$;

GRANT EXECUTE ON FUNCTION public.app_is_admin() TO authenticated, anon;

-- ── 3. terms 쓰기 정책을 "인증된 사용자 누구나" → "관리자만" 으로 교체 ──
DROP POLICY IF EXISTS "terms_write_authenticated" ON terms;
DROP POLICY IF EXISTS "terms_write_admin" ON terms;
CREATE POLICY "terms_write_admin" ON terms
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());

-- 약관 조회는 계속 누구나 가능 (온보딩 화면 노출용, 기존 정책 유지)
-- "terms_select_all" ON terms FOR SELECT USING (true)  ← add_onboarding_terms.sql 에서 이미 생성됨

-- ── 4. 최초 관리자 지정 ────────────────────────────────
-- 아래 이메일을 본인 계정으로 바꿔서 별도로 실행하세요.
-- UPDATE users SET is_admin = true WHERE email = '본인이메일@example.com';
