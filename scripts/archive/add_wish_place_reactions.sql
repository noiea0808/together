-- "가고 싶은 곳" 하트(좋아요) + 댓글 — 기존 제안(wish_place_proposals, 그룹 선택 + 메시지 단건 발송)
-- 방식을 SNS 스타일로 완전히 대체한다. wish_place_proposals 테이블/함수는 더 이상 앱에서
-- 사용하지 않지만, 과거 데이터 보존을 위해 이 스크립트에서 드롭하지는 않는다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
-- 선행 조건: add_wish_place_scope.sql (can_view_wish_place, app_current_user_id)

CREATE TABLE IF NOT EXISTS wish_place_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wish_place_id UUID NOT NULL REFERENCES wish_places(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wish_place_id, user_id)
);

CREATE INDEX IF NOT EXISTS wish_place_likes_wish_place_idx ON wish_place_likes(wish_place_id);

ALTER TABLE wish_place_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wish_place_likes_select_related" ON wish_place_likes;
DROP POLICY IF EXISTS "wish_place_likes_insert_own" ON wish_place_likes;
DROP POLICY IF EXISTS "wish_place_likes_delete_own" ON wish_place_likes;

-- can_view_wish_place와 동일한 관계(본인/친구/같은 그룹 + 공개 범위 제한)를 가진 사람만
-- 좋아요를 보거나 남길 수 있다.
CREATE POLICY "wish_place_likes_select_related" ON wish_place_likes
  FOR SELECT TO authenticated
  USING (public.can_view_wish_place(wish_place_id, public.app_current_user_id()));

CREATE POLICY "wish_place_likes_insert_own" ON wish_place_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.app_current_user_id()
    AND public.can_view_wish_place(wish_place_id, public.app_current_user_id())
  );

CREATE POLICY "wish_place_likes_delete_own" ON wish_place_likes
  FOR DELETE TO authenticated
  USING (user_id = public.app_current_user_id());

CREATE TABLE IF NOT EXISTS wish_place_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wish_place_id UUID NOT NULL REFERENCES wish_places(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wish_place_comments_wish_place_idx ON wish_place_comments(wish_place_id, created_at);

ALTER TABLE wish_place_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wish_place_comments_select_related" ON wish_place_comments;
DROP POLICY IF EXISTS "wish_place_comments_insert_related" ON wish_place_comments;
DROP POLICY IF EXISTS "wish_place_comments_delete_own_or_owner" ON wish_place_comments;

CREATE POLICY "wish_place_comments_select_related" ON wish_place_comments
  FOR SELECT TO authenticated
  USING (public.can_view_wish_place(wish_place_id, public.app_current_user_id()));

CREATE POLICY "wish_place_comments_insert_related" ON wish_place_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.app_current_user_id()
    AND public.can_view_wish_place(wish_place_id, public.app_current_user_id())
  );

-- 댓글 작성자 본인 또는 위시 항목 소유자(자기 게시물의 부적절한 댓글 정리) 둘 다 삭제 가능.
CREATE POLICY "wish_place_comments_delete_own_or_owner" ON wish_place_comments
  FOR DELETE TO authenticated
  USING (
    user_id = public.app_current_user_id()
    OR wish_place_id IN (SELECT id FROM wish_places WHERE user_id = public.app_current_user_id())
  );

-- 댓글 목록 조회 — users RLS(같은 밥팟 참여자만 조회 가능)를 우회해서 작성자 닉네임/사진을
-- 서버에서 직접 반환한다 (get_my_wish_place_proposals와 동일한 이유).
CREATE OR REPLACE FUNCTION public.get_wish_place_comments(p_wish_place_id UUID)
RETURNS TABLE(id UUID, user_id UUID, nickname TEXT, avatar_url TEXT, content TEXT, created_at TIMESTAMPTZ)
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
    SELECT c.id, c.user_id, u.nickname, u.avatar_url, c.content, c.created_at
    FROM wish_place_comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.wish_place_id = p_wish_place_id
    ORDER BY c.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wish_place_comments(UUID) TO authenticated;

-- get_friend_wish_places 재정의 — 제안 그룹 선택(eligible_group_ids)은 더 이상 필요 없지만
-- 기존 공개 범위 표시(restricted)는 그대로 쓰고, 좋아요/댓글 집계를 추가한다.
-- 반환 컬럼 구성이 바뀌므로(add_wish_place_scope.sql) CREATE OR REPLACE만으로는 안 되고 DROP이 필요하다.
DROP FUNCTION IF EXISTS public.get_friend_wish_places(UUID);

CREATE OR REPLACE FUNCTION public.get_friend_wish_places(target_user_id UUID)
RETURNS TABLE(
  id UUID, content TEXT, category TEXT, sort_order INT, created_at TIMESTAMPTZ,
  restricted BOOLEAN, like_count BIGINT, liked_by_me BOOLEAN, comment_count BIGINT
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
      (SELECT count(*) FROM wish_place_comments c WHERE c.wish_place_id = wp.id) AS comment_count
    FROM wish_places wp
    WHERE wp.user_id = target_user_id
      AND public.can_view_wish_place(wp.id, me)
    ORDER BY wp.sort_order ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_wish_places(UUID) TO authenticated;

-- 내 계정 화면(내 위시 항목들)에 좋아요/댓글 수를 한 번에 붙여주는 집계.
CREATE OR REPLACE FUNCTION public.get_my_wish_place_reactions()
RETURNS TABLE(wish_place_id UUID, like_count BIGINT, comment_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT wp.id,
    (SELECT count(*) FROM wish_place_likes l WHERE l.wish_place_id = wp.id),
    (SELECT count(*) FROM wish_place_comments c WHERE c.wish_place_id = wp.id)
  FROM wish_places wp
  WHERE wp.user_id = public.app_current_user_id()
$$;

GRANT EXECUTE ON FUNCTION public.get_my_wish_place_reactions() TO authenticated;

-- 좋아요/댓글 알림 — notifications 테이블은 pot_id/group_id/friend_request_id/
-- wish_place_proposal_id 기준으로만 insert를 허용하므로 전용 컬럼과 정책을 추가한다.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS wish_place_like_id UUID REFERENCES wish_place_likes(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS wish_place_comment_id UUID REFERENCES wish_place_comments(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "notifications_insert_wishlike" ON notifications;
DROP POLICY IF EXISTS "notifications_insert_wishcomment" ON notifications;

CREATE POLICY "notifications_insert_wishlike" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    wish_place_like_id IN (SELECT id FROM wish_place_likes WHERE user_id = public.app_current_user_id())
  );

CREATE POLICY "notifications_insert_wishcomment" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    wish_place_comment_id IN (SELECT id FROM wish_place_comments WHERE user_id = public.app_current_user_id())
  );
