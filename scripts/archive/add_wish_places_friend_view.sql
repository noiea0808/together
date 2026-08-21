-- 친구/같은 그룹 멤버의 "가고 싶은데..." 목록 조회
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

-- wish_places 테이블 SELECT RLS(add_wish_places.sql)는 본인 행만 허용하므로,
-- 친구 관리 화면에서 상대방의 위시 리스트를 보려면 friend_requests(accepted) 또는
-- 같은 그룹 소속 여부를 확인하는 SECURITY DEFINER RPC를 거쳐야 한다.
-- (get_my_friends와 동일한 패턴 — add_friends.sql 참고)
CREATE OR REPLACE FUNCTION public.get_friend_wish_places(target_user_id UUID)
RETURNS TABLE(id UUID, content TEXT, sort_order INT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  me UUID := public.app_current_user_id();
  is_related BOOLEAN;
BEGIN
  IF me IS NULL OR target_user_id IS NULL THEN
    RETURN;
  END IF;

  IF target_user_id = me THEN
    is_related := true;
  ELSE
    SELECT
      EXISTS (
        SELECT 1 FROM friend_requests fr
        WHERE fr.status = 'accepted'
          AND ((fr.from_user_id = me AND fr.to_user_id = target_user_id)
            OR (fr.from_user_id = target_user_id AND fr.to_user_id = me))
      )
      OR EXISTS (
        SELECT 1 FROM group_members gm1
        JOIN group_members gm2 ON gm2.group_id = gm1.group_id
        WHERE gm1.user_id = me AND gm2.user_id = target_user_id
      )
    INTO is_related;
  END IF;

  IF NOT is_related THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT wp.id, wp.content, wp.sort_order, wp.created_at
    FROM wish_places wp
    WHERE wp.user_id = target_user_id
    ORDER BY wp.sort_order ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_wish_places(UUID) TO authenticated;
