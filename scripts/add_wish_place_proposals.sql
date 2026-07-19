-- "가고 싶은데..." 항목에 "같이 가고 싶어요" 제안 보내기
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
-- 선행 조건: add_wish_place_scope.sql을 먼저 실행해서 can_view_wish_place()가 있어야 한다.

-- accept/decline 워크플로우나 댓글 스레드가 아니라, 제안자 -> 소유자 단방향으로만 남는
-- 가벼운 "관심 표시" 기록이다. 같은 사람이 같은 항목에 중복 제안하지 못하게 UNIQUE로 막는다.
CREATE TABLE IF NOT EXISTS wish_place_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wish_place_id UUID NOT NULL REFERENCES wish_places(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user_id != to_user_id),
  UNIQUE (wish_place_id, from_user_id)
);

CREATE INDEX IF NOT EXISTS wish_place_proposals_to_user_idx ON wish_place_proposals(to_user_id, created_at);
CREATE INDEX IF NOT EXISTS wish_place_proposals_wish_place_idx ON wish_place_proposals(wish_place_id);

ALTER TABLE wish_place_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wish_place_proposals_select_related" ON wish_place_proposals;
DROP POLICY IF EXISTS "wish_place_proposals_insert_related" ON wish_place_proposals;
DROP POLICY IF EXISTS "wish_place_proposals_delete_related" ON wish_place_proposals;

-- 제안한 사람("제안함 ✓" 표시용)과 받은 사람(소유자) 둘 다 자기 관련 행을 조회 가능
CREATE POLICY "wish_place_proposals_select_related" ON wish_place_proposals
  FOR SELECT TO authenticated
  USING (from_user_id = public.app_current_user_id() OR to_user_id = public.app_current_user_id());

-- wish_places SELECT RLS는 본인 행만 허용하므로, RLS 정책 안에서 남의 위시 항목 소유자를
-- 직접 서브쿼리로 조회하면 항상 0건(NULL)이 나온다. SECURITY DEFINER로 우회해서 조회한다.
CREATE OR REPLACE FUNCTION public.wish_place_owner(p_wish_place_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT user_id FROM wish_places WHERE id = p_wish_place_id
$$;

GRANT EXECUTE ON FUNCTION public.wish_place_owner(UUID) TO authenticated;

-- proposeWishPlace가 알림 문구에 넣을 위시 항목 내용을 가져올 때 사용. wish_places SELECT RLS로는
-- 남의 항목을 못 읽으므로 SECURITY DEFINER로 우회하되, can_view_wish_place로 한 번 더 관계를 확인한다.
CREATE OR REPLACE FUNCTION public.get_wish_place_content(p_wish_place_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE me UUID := public.app_current_user_id();
BEGIN
  IF NOT public.can_view_wish_place(p_wish_place_id, me) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT content FROM wish_places WHERE id = p_wish_place_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wish_place_content(UUID) TO authenticated;

-- 본인이 보내는 제안만, 그 위시 항목을 실제로 볼 수 있는 경우에만, to_user_id가 그 항목의
-- 실제 소유자와 일치하는 경우에만 삽입 가능 (위조된 to_user_id/wish_place_id 조합 방지)
CREATE POLICY "wish_place_proposals_insert_related" ON wish_place_proposals
  FOR INSERT TO authenticated
  WITH CHECK (
    from_user_id = public.app_current_user_id()
    AND to_user_id = public.wish_place_owner(wish_place_id)
    AND public.can_view_wish_place(wish_place_id, public.app_current_user_id())
  );

-- 제안한 사람(취소) 또는 받은 사람(정리)이 삭제 가능. 수락/거절이 없으므로 UPDATE 정책은 없다.
CREATE POLICY "wish_place_proposals_delete_related" ON wish_place_proposals
  FOR DELETE TO authenticated
  USING (from_user_id = public.app_current_user_id() OR to_user_id = public.app_current_user_id());

-- 친구 위시리스트를 열 때 "이미 제안한 항목"을 표시하기 위한 조회.
-- (GroupSlotCard의 getMyPendingInvitationsForDate와 같은 패턴 — 상대방 한 명 기준으로 한 번만 조회)
CREATE OR REPLACE FUNCTION public.get_my_sent_wish_proposals(p_to_user_id UUID)
RETURNS TABLE(wish_place_id UUID, group_id UUID, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT wish_place_id, group_id, created_at
  FROM wish_place_proposals
  WHERE from_user_id = public.app_current_user_id() AND to_user_id = p_to_user_id
$$;

GRANT EXECUTE ON FUNCTION public.get_my_sent_wish_proposals(UUID) TO authenticated;

-- 내 계정 화면에서 "내 위시 항목에 누가 관심을 보였는지" 한 번에 조회.
-- users 테이블 RLS(같은 밥팟 참여자만 조회 가능)를 우회해서 닉네임/사진을 서버에서 직접 반환한다
-- (get_my_friends와 동일한 이유 — add_friends.sql 참고).
CREATE OR REPLACE FUNCTION public.get_my_wish_place_proposals()
RETURNS TABLE(
  id UUID, wish_place_id UUID, from_user_id UUID, from_nickname TEXT, from_avatar_url TEXT,
  message TEXT, group_id UUID, group_name TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id, p.wish_place_id, p.from_user_id, u.nickname, u.avatar_url, p.message, p.group_id, g.name, p.created_at
  FROM wish_place_proposals p
  JOIN users u ON u.id = p.from_user_id
  LEFT JOIN groups g ON g.id = p.group_id
  WHERE p.to_user_id = public.app_current_user_id()
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_wish_place_proposals() TO authenticated;

-- 위시 제안 알림 — notifications 테이블은 pot_id/group_id/friend_request_id 기준으로만 insert를
-- 허용하므로 wish_place_proposal_id 컬럼과 그 전용 정책을 추가한다.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS wish_place_proposal_id UUID REFERENCES wish_place_proposals(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "notifications_insert_wishpropose" ON notifications;

-- 친구 요청 알림과 달리 제안자 -> 소유자 단방향만 존재(수락/거절 없음)하므로 단방향 체크만 둔다.
CREATE POLICY "notifications_insert_wishpropose" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    wish_place_proposal_id IN (
      SELECT id FROM wish_place_proposals WHERE from_user_id = public.app_current_user_id()
    )
  );
