-- "가고 싶은데..." 항목 공개 범위 기본값을 전체공개 → 비공개(나만 보기)로 변경
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

-- add_wish_place_scope.sql 의 can_view_wish_place는 wish_place_shares 행이 하나도
-- 없으면 "친구/같은 그룹이면 다 보임(전체 공개)"으로 처리했다. 이제는 반대로,
-- 공유 그룹을 하나도 선택하지 않으면 본인 외에는 아무도 못 보는 게 기본값이다
-- (add_moment_scope.sql과 같은 "가장 보수적인 값" 원칙).
CREATE OR REPLACE FUNCTION public.can_view_wish_place(p_wish_place_id UUID, p_viewer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  owner_id UUID;
BEGIN
  SELECT user_id INTO owner_id FROM wish_places WHERE id = p_wish_place_id;
  IF owner_id IS NULL OR p_viewer_id IS NULL THEN
    RETURN false;
  END IF;

  IF owner_id = p_viewer_id THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.user_id = p_viewer_id
      AND gm.group_id IN (SELECT group_id FROM wish_place_shares WHERE wish_place_id = p_wish_place_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_wish_place(UUID, UUID) TO authenticated;
