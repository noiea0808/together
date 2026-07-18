-- "가고 싶은데..." 항목별 그룹 공개 범위 제한
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

-- add_wish_places.sql의 주석에서 예고했던 확장. wish_place_shares에 행이 없으면
-- 기존과 동일하게 전체 공개(친구/같은 그룹이면 다 보임), 행이 있으면 그 그룹들에만 공개된다.
CREATE TABLE IF NOT EXISTS wish_place_shares (
  wish_place_id UUID NOT NULL REFERENCES wish_places(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (wish_place_id, group_id)
);

ALTER TABLE wish_place_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wish_place_shares_select_own" ON wish_place_shares;
DROP POLICY IF EXISTS "wish_place_shares_insert_own" ON wish_place_shares;
DROP POLICY IF EXISTS "wish_place_shares_delete_own" ON wish_place_shares;

-- 이 테이블엔 자체 user_id가 없어 부모(wish_places.user_id)를 거쳐 소유권을 판단한다.
CREATE POLICY "wish_place_shares_select_own" ON wish_place_shares
  FOR SELECT TO authenticated
  USING (wish_place_id IN (SELECT id FROM wish_places WHERE user_id = public.app_current_user_id()));

CREATE POLICY "wish_place_shares_insert_own" ON wish_place_shares
  FOR INSERT TO authenticated
  WITH CHECK (wish_place_id IN (SELECT id FROM wish_places WHERE user_id = public.app_current_user_id()));

CREATE POLICY "wish_place_shares_delete_own" ON wish_place_shares
  FOR DELETE TO authenticated
  USING (wish_place_id IN (SELECT id FROM wish_places WHERE user_id = public.app_current_user_id()));

-- 위시 항목 하나를 특정 뷰어가 볼 수 있는지 판단하는 공용 헬퍼.
-- get_friend_wish_places RPC와 wish_place_proposals INSERT RLS(add_wish_place_proposals.sql) 양쪽에서
-- 같은 로직을 재사용해서, 클라이언트가 못 보는 항목에 제안을 억지로 꽂는 것도 함께 막는다.
CREATE OR REPLACE FUNCTION public.can_view_wish_place(p_wish_place_id UUID, p_viewer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  owner_id UUID;
  is_restricted BOOLEAN;
BEGIN
  SELECT user_id INTO owner_id FROM wish_places WHERE id = p_wish_place_id;
  IF owner_id IS NULL OR p_viewer_id IS NULL THEN
    RETURN false;
  END IF;

  IF owner_id = p_viewer_id THEN
    RETURN true;
  END IF;

  SELECT EXISTS (SELECT 1 FROM wish_place_shares WHERE wish_place_id = p_wish_place_id) INTO is_restricted;

  IF is_restricted THEN
    RETURN EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.user_id = p_viewer_id
        AND gm.group_id IN (SELECT group_id FROM wish_place_shares WHERE wish_place_id = p_wish_place_id)
    );
  END IF;

  RETURN
    EXISTS (
      SELECT 1 FROM friend_requests fr
      WHERE fr.status = 'accepted'
        AND ((fr.from_user_id = p_viewer_id AND fr.to_user_id = owner_id)
          OR (fr.from_user_id = owner_id AND fr.to_user_id = p_viewer_id))
    )
    OR EXISTS (
      SELECT 1 FROM group_members gm1
      JOIN group_members gm2 ON gm2.group_id = gm1.group_id
      WHERE gm1.user_id = p_viewer_id AND gm2.user_id = owner_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_wish_place(UUID, UUID) TO authenticated;

-- get_friend_wish_places 재정의 — 기존엔 테이블 전체를 "관계 있으면 다 보여준다"는 단일 게이트로
-- 걸렀지만, 이제 항목별로 can_view_wish_place를 적용한다. 제안 다이얼로그의 그룹 선택지를
-- 추가 조회 없이 그릴 수 있도록 restricted/eligible_group_ids도 함께 반환한다.
-- eligible_group_ids는 "이 항목의 제한 그룹 ∩ 뷰어가 속한 그룹"의 교집합만 반환한다 —
-- 제한 그룹 전체를 보여주면 "소유자가 뷰어가 모르는 다른 그룹에도 있다"는 정보가 새어나가기 때문.
-- 반환 컬럼 구성이 기존 함수(add_wish_places_friend_view.sql)와 달라 CREATE OR REPLACE만으로는
-- 안 되고(PostgreSQL은 OUT 파라미터 구성이 바뀌면 거부한다) 먼저 DROP이 필요하다.
DROP FUNCTION IF EXISTS public.get_friend_wish_places(UUID);

CREATE OR REPLACE FUNCTION public.get_friend_wish_places(target_user_id UUID)
RETURNS TABLE(id UUID, content TEXT, sort_order INT, created_at TIMESTAMPTZ, restricted BOOLEAN, eligible_group_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL OR target_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      wp.id, wp.content, wp.sort_order, wp.created_at,
      EXISTS (SELECT 1 FROM wish_place_shares s WHERE s.wish_place_id = wp.id) AS restricted,
      (
        SELECT array_agg(s.group_id) FROM wish_place_shares s
        JOIN group_members gm ON gm.group_id = s.group_id AND gm.user_id = me
        WHERE s.wish_place_id = wp.id
      ) AS eligible_group_ids
    FROM wish_places wp
    WHERE wp.user_id = target_user_id
      AND public.can_view_wish_place(wp.id, me)
    ORDER BY wp.sort_order ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_wish_places(UUID) TO authenticated;
