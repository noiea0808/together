-- 네비 메뉴 레드닷 (모먼트 그룹/전체 탭, 친구의 새 위시플레이스)
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
--
-- 실시간 구독을 새로 걸지 않고, 앱 진입 시 "마지막으로 본 시각 이후 새 항목이 있는가"만
-- 1회 조회하는 온디맨드 방식이다. 알림(notifications)처럼 즉시 알려줘야 하는 정보가 아니라
-- 다음 방문 때 참고하는 힌트 수준이라 이 정도로 충분하고 비용도 훨씬 싸다.

-- meal_pots에 생성 시각이 없으면 "새 글" 판정 기준으로 쓸 수 없으므로 보강해둔다.
ALTER TABLE meal_pots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS user_nav_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  moments_group_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  moments_public_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  friends_wish_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_nav_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_nav_state_select_own" ON user_nav_state;

-- 쓰기는 아래 SECURITY DEFINER 함수들을 통해서만 한다(직접 upsert 불필요).
CREATE POLICY "user_nav_state_select_own" ON user_nav_state
  FOR SELECT TO authenticated
  USING (user_id = public.app_current_user_id());

-- 레드닷 조회 — 행이 없으면 지금 시각으로 기본 행을 만든다. 그래야 기존 데이터가
-- 전부 "새 글"로 오탐되지 않고, 신규/오랜만에 접속한 유저도 첫 조회는 전부 false로 시작한다.
CREATE OR REPLACE FUNCTION public.get_nav_badges()
RETURNS TABLE(
  moments_group BOOLEAN,
  moments_public BOOLEAN,
  friends_wish BOOLEAN,
  friend_ids_with_new_wish UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := public.app_current_user_id();
  seen RECORD;
  my_group_ids UUID[];
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO user_nav_state (user_id) VALUES (me)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT moments_group_seen_at, moments_public_seen_at, friends_wish_seen_at
    INTO seen
    FROM user_nav_state WHERE user_id = me;

  SELECT array_agg(group_id) INTO my_group_ids FROM group_members WHERE user_id = me;

  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1 FROM meal_pots
      WHERE moment_scope IN ('group', 'public')
        AND group_id = ANY(my_group_ids)
        AND created_at > seen.moments_group_seen_at
    ),
    EXISTS (
      SELECT 1 FROM meal_pots
      WHERE moment_scope = 'public'
        AND created_at > seen.moments_public_seen_at
    ),
    -- "친구의 위시"는 정식 친구(friend_requests)로 한정하지 않는다 — 이 앱은 같은 그룹 멤버가
    -- 그룹 공유한 위시도 GroupPage 친구 목록에 함께 보여주고, 실제 가시성은 can_view_wish_place가
    -- (친구 관계 + 그룹 공유 모두) 판정한다. 그래서 그 함수 하나만 단일 게이트로 쓴다.
    -- 내 것은 항상 볼 수 있으니 wp.user_id != me로 제외한다.
    EXISTS (
      SELECT 1 FROM wish_places wp
      WHERE wp.user_id != me
        AND wp.created_at > seen.friends_wish_seen_at
        AND public.can_view_wish_place(wp.id, me)
    ),
    (
      SELECT array_agg(DISTINCT wp.user_id) FROM wish_places wp
      WHERE wp.user_id != me
        AND wp.created_at > seen.friends_wish_seen_at
        AND public.can_view_wish_place(wp.id, me)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nav_badges() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_moments_seen(p_scope TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL OR p_scope NOT IN ('group', 'public') THEN
    RETURN;
  END IF;

  INSERT INTO user_nav_state (user_id) VALUES (me)
  ON CONFLICT (user_id) DO NOTHING;

  IF p_scope = 'group' THEN
    UPDATE user_nav_state SET moments_group_seen_at = now() WHERE user_id = me;
  ELSE
    UPDATE user_nav_state SET moments_public_seen_at = now() WHERE user_id = me;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_moments_seen(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_friends_wish_seen()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO user_nav_state (user_id) VALUES (me)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE user_nav_state SET friends_wish_seen_at = now() WHERE user_id = me;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_friends_wish_seen() TO authenticated;
