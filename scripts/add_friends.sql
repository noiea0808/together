-- 친구 검색/요청 기능
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

-- 1) 검색 노출 여부 (내 계정 설정) — 기본 노출(ON)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_discoverable BOOLEAN NOT NULL DEFAULT true;

-- 2) 친구 요청 테이블 — 수락 전까지는 pending, 수락되면 accepted로 남아 그 자체가 "친구 관계"가 된다.
CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CHECK (from_user_id != to_user_id),
  UNIQUE (from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS friend_requests_to_user_idx ON friend_requests(to_user_id, status);
CREATE INDEX IF NOT EXISTS friend_requests_from_user_idx ON friend_requests(from_user_id, status);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friend_requests_select_own" ON friend_requests;
DROP POLICY IF EXISTS "friend_requests_insert_own" ON friend_requests;
DROP POLICY IF EXISTS "friend_requests_update_participant" ON friend_requests;
DROP POLICY IF EXISTS "friend_requests_delete_participant" ON friend_requests;

-- 요청을 보냈거나 받은 당사자만 조회 가능
CREATE POLICY "friend_requests_select_own" ON friend_requests
  FOR SELECT TO authenticated
  USING (from_user_id = public.app_current_user_id() OR to_user_id = public.app_current_user_id());

-- 내가 보내는 요청만 생성 가능
CREATE POLICY "friend_requests_insert_own" ON friend_requests
  FOR INSERT TO authenticated
  WITH CHECK (from_user_id = public.app_current_user_id());

-- 당사자(보낸 사람/받은 사람)만 상태 변경(수락/거절/재전송) 가능
CREATE POLICY "friend_requests_update_participant" ON friend_requests
  FOR UPDATE TO authenticated
  USING (from_user_id = public.app_current_user_id() OR to_user_id = public.app_current_user_id())
  WITH CHECK (from_user_id = public.app_current_user_id() OR to_user_id = public.app_current_user_id());

-- 당사자만 삭제(요청 취소 / 친구 끊기) 가능
CREATE POLICY "friend_requests_delete_participant" ON friend_requests
  FOR DELETE TO authenticated
  USING (from_user_id = public.app_current_user_id() OR to_user_id = public.app_current_user_id());

-- 3) 유저 검색 — 이메일은 완전일치만(스캔 방지), 닉네임은 부분일치.
-- 비공개(is_discoverable=false) 계정과 "결과 없음"을 구분하지 않아 계정 존재 여부 자체가 새지 않는다.
-- 게스트 계정은 검색 대상에서 제외한다.
CREATE OR REPLACE FUNCTION public.search_users(p_query TEXT)
RETURNS TABLE(id UUID, nickname TEXT, avatar_url TEXT, relation TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  me UUID := public.app_current_user_id();
  q TEXT := trim(p_query);
BEGIN
  IF me IS NULL OR length(q) < 2 THEN
    RETURN;
  END IF;

  IF q LIKE '%@%' THEN
    RETURN QUERY
    SELECT u.id, u.nickname, u.avatar_url,
      COALESCE(
        CASE
          WHEN fr.status = 'accepted' THEN 'friends'
          WHEN fr.status = 'pending' AND fr.from_user_id = me THEN 'pending_sent'
          WHEN fr.status = 'pending' AND fr.to_user_id = me THEN 'pending_received'
        END, 'none')
    FROM users u
    LEFT JOIN friend_requests fr
      ON (fr.from_user_id = me AND fr.to_user_id = u.id)
      OR (fr.from_user_id = u.id AND fr.to_user_id = me)
    WHERE lower(u.email) = lower(q)
      AND u.id != me AND u.is_guest = false AND u.is_discoverable = true
    LIMIT 1;
  ELSE
    RETURN QUERY
    SELECT u.id, u.nickname, u.avatar_url,
      COALESCE(
        CASE
          WHEN fr.status = 'accepted' THEN 'friends'
          WHEN fr.status = 'pending' AND fr.from_user_id = me THEN 'pending_sent'
          WHEN fr.status = 'pending' AND fr.to_user_id = me THEN 'pending_received'
        END, 'none')
    FROM users u
    LEFT JOIN friend_requests fr
      ON (fr.from_user_id = me AND fr.to_user_id = u.id)
      OR (fr.from_user_id = u.id AND fr.to_user_id = me)
    WHERE u.nickname ILIKE '%' || q || '%'
      AND u.id != me AND u.is_guest = false AND u.is_discoverable = true
    ORDER BY u.nickname
    LIMIT 20;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_users(TEXT) TO authenticated;

-- 4) 친구 목록/요청 조회 — users 테이블 자체 RLS(같은 밥팟 참여자만 조회 가능)를 우회해서
-- 친구 상대방의 최소 프로필(닉네임/사진)만 SECURITY DEFINER로 반환한다.
CREATE OR REPLACE FUNCTION public.get_my_friends()
RETURNS TABLE(request_id UUID, id UUID, nickname TEXT, avatar_url TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT fr.id AS request_id,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.id ELSE u1.id END,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.nickname ELSE u1.nickname END,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.avatar_url ELSE u1.avatar_url END
  FROM friend_requests fr
  JOIN users u1 ON u1.id = fr.from_user_id
  JOIN users u2 ON u2.id = fr.to_user_id
  WHERE fr.status = 'accepted'
    AND (fr.from_user_id = public.app_current_user_id() OR fr.to_user_id = public.app_current_user_id());
$$;

GRANT EXECUTE ON FUNCTION public.get_my_friends() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_friend_requests()
RETURNS TABLE(id UUID, direction TEXT, other_id UUID, other_nickname TEXT, other_avatar_url TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT fr.id,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN 'sent' ELSE 'received' END,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.id ELSE u1.id END,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.nickname ELSE u1.nickname END,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.avatar_url ELSE u1.avatar_url END,
    fr.created_at
  FROM friend_requests fr
  JOIN users u1 ON u1.id = fr.from_user_id
  JOIN users u2 ON u2.id = fr.to_user_id
  WHERE fr.status = 'pending'
    AND (fr.from_user_id = public.app_current_user_id() OR fr.to_user_id = public.app_current_user_id())
  ORDER BY fr.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_friend_requests() TO authenticated;

-- 5) 친구 요청 알림 — notifications 테이블은 pot_id/group_id 기준으로만 insert를 허용하므로
-- friend_request_id 컬럼과 그 요청의 당사자만 insert할 수 있는 정책을 추가한다.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS friend_request_id UUID REFERENCES friend_requests(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "notifications_insert_friendreq" ON notifications;
CREATE POLICY "notifications_insert_friendreq" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    friend_request_id IN (
      SELECT id FROM friend_requests
      WHERE from_user_id = public.app_current_user_id() OR to_user_id = public.app_current_user_id()
    )
  );
