-- "가고 싶은 곳" 링크 미리보기(제목/설명/이미지/사이트명)를 등록 시점에 한 번 가져와
-- 저장해둔다. 매번 화면을 열 때마다 다시 긁어오면 느리게 뜨는 문제가 있어, 저장된 값을
-- 그대로 보여주고 필요할 때만 새로고침 버튼으로 다시 가져오게 바꾼다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
-- 선행 조건: add_wish_place_reactions.sql (get_friend_wish_places의 현재 반환 컬럼 기준)

ALTER TABLE wish_places
  ADD COLUMN IF NOT EXISTS preview_title TEXT,
  ADD COLUMN IF NOT EXISTS preview_description TEXT,
  ADD COLUMN IF NOT EXISTS preview_image TEXT,
  ADD COLUMN IF NOT EXISTS preview_site_name TEXT;

-- get_friend_wish_places(add_wish_place_reactions.sql에서 마지막으로 재정의됨)도 이
-- 컬럼들을 함께 반환하도록 재정의한다. 반환 컬럼 구성이 바뀌므로 CREATE OR REPLACE 전에
-- DROP이 필요하다.
DROP FUNCTION IF EXISTS public.get_friend_wish_places(UUID);

CREATE OR REPLACE FUNCTION public.get_friend_wish_places(target_user_id UUID)
RETURNS TABLE(
  id UUID, content TEXT, category TEXT, sort_order INT, created_at TIMESTAMPTZ,
  restricted BOOLEAN, like_count BIGINT, liked_by_me BOOLEAN, comment_count BIGINT,
  preview_title TEXT, preview_description TEXT, preview_image TEXT, preview_site_name TEXT
)
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
      wp.id, wp.content, wp.category, wp.sort_order, wp.created_at,
      EXISTS (SELECT 1 FROM wish_place_shares s WHERE s.wish_place_id = wp.id) AS restricted,
      (SELECT count(*) FROM wish_place_likes l WHERE l.wish_place_id = wp.id) AS like_count,
      EXISTS (SELECT 1 FROM wish_place_likes l WHERE l.wish_place_id = wp.id AND l.user_id = me) AS liked_by_me,
      (SELECT count(*) FROM wish_place_comments c WHERE c.wish_place_id = wp.id) AS comment_count,
      wp.preview_title, wp.preview_description, wp.preview_image, wp.preview_site_name
    FROM wish_places wp
    WHERE wp.user_id = target_user_id
      AND public.can_view_wish_place(wp.id, me)
    ORDER BY wp.sort_order ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_wish_places(UUID) TO authenticated;
