-- 밥팟 '모먼트' 공유 범위 (참여자만 / 그룹공유 / 전체공유)
-- add_moment_share.sql 의 share_moment(boolean) 을 3단계 moment_scope(text) 로 교체한다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

-- 1) moment_scope 컬럼 추가. 기본값 'participants' — 기존 share_moment 값과 무관하게
--    전부 가장 보수적인(안 새는) 값으로 시작한다.
ALTER TABLE meal_pots ADD COLUMN IF NOT EXISTS moment_scope TEXT NOT NULL DEFAULT 'participants';

ALTER TABLE meal_pots DROP CONSTRAINT IF EXISTS meal_pots_moment_scope_check;
ALTER TABLE meal_pots ADD CONSTRAINT meal_pots_moment_scope_check
  CHECK (moment_scope IN ('participants', 'group', 'public'));

-- 2) pot_comments / pot_photos SELECT 정책 — 3단계 범위 반영. share_moment 컬럼을
--    참조하던 기존 정책(add_moment_share.sql)을 moment_scope 기준으로 교체한다.
--    (share_moment 컬럼을 드롭하려면 이걸 참조하는 정책부터 먼저 없애야 한다)
--    - participants: 참여자만 (app_my_pot_ids)
--    - group: 참여자 + 같은 그룹 멤버 전체
--    - public: 참여자 + 인증된 앱 사용자 전체
DROP POLICY IF EXISTS "pot_comments_select_member" ON pot_comments;
CREATE POLICY "pot_comments_select_member" ON pot_comments
  FOR SELECT TO authenticated
  USING (
    pot_id IN (SELECT public.app_my_pot_ids())
    OR pot_id IN (SELECT id FROM meal_pots WHERE moment_scope = 'group' AND group_id IN (SELECT public.app_my_group_ids()))
    OR pot_id IN (SELECT id FROM meal_pots WHERE moment_scope = 'public')
  );

DROP POLICY IF EXISTS "pot_photos_select_member" ON pot_photos;
CREATE POLICY "pot_photos_select_member" ON pot_photos
  FOR SELECT TO authenticated
  USING (
    pot_id IN (SELECT public.app_my_pot_ids())
    OR pot_id IN (SELECT id FROM meal_pots WHERE moment_scope = 'group' AND group_id IN (SELECT public.app_my_group_ids()))
    OR pot_id IN (SELECT id FROM meal_pots WHERE moment_scope = 'public')
  );

-- 3) 이제 share_moment 컬럼을 참조하는 정책이 없으니 컬럼 제거 가능
ALTER TABLE meal_pots DROP COLUMN IF EXISTS share_moment;

-- 4) moment_scope 변경 전용 RPC — 밥팟 참여자 본인만 호출 가능.
--    meal_pots 테이블 자체의 UPDATE RLS를 열어주는 대신, 이 컬럼 하나만 바꾸는
--    SECURITY DEFINER 함수로 좁혀서 다른 필드(제목/시간 등)까지 열리지 않게 한다.
CREATE OR REPLACE FUNCTION public.set_pot_moment_scope(p_pot_id uuid, p_scope text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_scope NOT IN ('participants', 'group', 'public') THEN
    RAISE EXCEPTION 'invalid moment_scope: %', p_scope;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pot_members WHERE pot_id = p_pot_id AND user_id = public.app_current_user_id()
  ) THEN
    RAISE EXCEPTION 'not a participant of this pot';
  END IF;
  UPDATE meal_pots SET moment_scope = p_scope WHERE id = p_pot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_pot_moment_scope(uuid, text) TO authenticated;

-- 5) groups 테이블 — '전체' 모먼트 피드에서 낯선(내가 속하지 않은) 그룹의 이름을
--    표시하려면, 전체공유 밥팟이 속한 그룹만큼은 누구나 이름을 조회할 수 있어야 한다.
DROP POLICY IF EXISTS "groups_select_via_public_pot" ON groups;
CREATE POLICY "groups_select_via_public_pot" ON groups
  FOR SELECT TO authenticated
  USING (id IN (SELECT group_id FROM meal_pots WHERE moment_scope = 'public'));
