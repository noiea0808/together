-- "가고 싶은 곳" 좋아요 누른 사람 목록 조회 + 본인 게시물 좋아요 금지 + 댓글 @멘션 알림
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
-- 선행 조건: add_wish_place_reactions.sql, add_wish_place_proposals.sql(wish_place_owner)

-- 좋아요 누른 사람 목록 — get_wish_place_comments와 동일한 이유로 users RLS를 우회해서
-- 작성자 닉네임/사진을 서버에서 직접 반환한다.
CREATE OR REPLACE FUNCTION public.get_wish_place_likes(p_wish_place_id UUID)
RETURNS TABLE(user_id UUID, nickname TEXT, avatar_url TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE me UUID := public.app_current_user_id();
BEGIN
  IF NOT public.can_view_wish_place(p_wish_place_id, me) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT l.user_id, u.nickname, u.avatar_url, l.created_at
    FROM wish_place_likes l
    JOIN users u ON u.id = l.user_id
    WHERE l.wish_place_id = p_wish_place_id
    ORDER BY l.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wish_place_likes(UUID) TO authenticated;

-- 본인 게시물에는 좋아요를 남길 수 없다. 클라이언트에서도 하트 버튼을 안 보여주지만,
-- API를 직접 호출하는 경우까지 막기 위해 RLS 레벨에서도 재차 확인한다.
DROP POLICY IF EXISTS "wish_place_likes_insert_own" ON wish_place_likes;

CREATE POLICY "wish_place_likes_insert_own" ON wish_place_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.app_current_user_id()
    AND public.can_view_wish_place(wish_place_id, public.app_current_user_id())
    AND user_id <> public.wish_place_owner(wish_place_id)
  );

-- 댓글 @멘션 알림 — notifications 테이블은 기존 원인 컬럼(wish_place_comment_id 등) 기준으로만
-- insert를 허용하므로, 멘션 전용 컬럼과 정책을 추가한다.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS wish_place_mention_comment_id UUID REFERENCES wish_place_comments(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "notifications_insert_wishmention" ON notifications;

CREATE POLICY "notifications_insert_wishmention" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    wish_place_mention_comment_id IN (SELECT id FROM wish_place_comments WHERE user_id = public.app_current_user_id())
  );
