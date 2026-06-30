-- 게스트(임시 닉네임) 밥팟 참여 지원
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
-- ※ 사전에 대시보드 Authentication → Sign In / Providers 에서 "Anonymous sign-ins" 를 활성화해야 합니다.

-- ── 1. users 컬럼 추가 ────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_pot_id UUID REFERENCES meal_pots(id) ON DELETE SET NULL;

-- ── 2. RLS 재귀 방지용 헬퍼 함수 (SECURITY DEFINER → RLS 우회) ──
-- 정책 본문에서 users/pot_members 를 직접 서브쿼리하면 정책이 자기 자신을 재평가해
-- "infinite recursion" 이 발생한다. 아래 함수로 우회한다.
CREATE OR REPLACE FUNCTION public.app_current_user_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.app_my_pot_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT pot_id FROM public.pot_members WHERE user_id = public.app_current_user_id()
$$;

GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.app_my_pot_ids() TO authenticated, anon;

-- ── 3. 이전(재귀) 정책 제거 ──────────────────────────
DROP POLICY IF EXISTS "meal_pots_select_authenticated" ON meal_pots;
DROP POLICY IF EXISTS "pot_members_insert_own" ON pot_members;
DROP POLICY IF EXISTS "pot_members_delete_own" ON pot_members;
DROP POLICY IF EXISTS "pot_members_select_sharedpot" ON pot_members;
DROP POLICY IF EXISTS "groups_select_via_pot" ON groups;
DROP POLICY IF EXISTS "users_select_sharedpot" ON users;

-- ── 4. 정책 재생성 (헬퍼 함수 사용 → 재귀 없음) ──────
-- meal_pots: 인증 사용자는 밥팟 SELECT 가능 (초대 링크 공유 모델)
CREATE POLICY "meal_pots_select_authenticated" ON meal_pots
  FOR SELECT TO authenticated USING (true);

-- pot_members: 본인 행 INSERT/DELETE
CREATE POLICY "pot_members_insert_own" ON pot_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.app_current_user_id());

CREATE POLICY "pot_members_delete_own" ON pot_members
  FOR DELETE TO authenticated
  USING (user_id = public.app_current_user_id());

-- pot_members: 내가 속한 팟의 참여자 목록 SELECT
CREATE POLICY "pot_members_select_sharedpot" ON pot_members
  FOR SELECT TO authenticated
  USING (pot_id IN (SELECT public.app_my_pot_ids()));

-- groups: 내가 참여한 밥팟의 그룹 SELECT (게스트가 그룹명 확인)
CREATE POLICY "groups_select_via_pot" ON groups
  FOR SELECT TO authenticated
  USING (id IN (SELECT group_id FROM meal_pots WHERE id IN (SELECT public.app_my_pot_ids())));

-- users: 같은 팟 참여자의 프로필(닉네임/게스트 여부) SELECT (+ 본인)
CREATE POLICY "users_select_sharedpot" ON users
  FOR SELECT TO authenticated
  USING (
    auth_id = auth.uid()
    OR id IN (SELECT user_id FROM pot_members WHERE pot_id IN (SELECT public.app_my_pot_ids()))
  );
