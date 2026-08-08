-- 친구 보기 상태 공유 on/off — 그룹 공유(group_share_settings)는 "그룹" 단위지만 친구는 그룹이
-- 없으므로 "친구 개별" 단위로 둔다. group_share_settings와 동일한 패턴(add_pot_invitations.sql,
-- simplify_group_share_settings.sql 참고), (user_id, friend_id, date) 키에 기본값 공유(true).
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE TABLE IF NOT EXISTS friend_share_settings (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  is_shared  BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, friend_id, date)
);

ALTER TABLE friend_share_settings ENABLE ROW LEVEL SECURITY;

-- 이 설정은 get_friends_daily_status/get_friends_pot_participation(SECURITY DEFINER)이
-- 내부에서만 참조하므로, 그룹처럼 "상대가 볼 수 있는" SELECT 정책은 필요 없다 — 본인 것만 읽고 쓴다.
DROP POLICY IF EXISTS "friend_share_settings_write_own" ON friend_share_settings;
CREATE POLICY "friend_share_settings_write_own" ON friend_share_settings
  FOR ALL TO authenticated
  USING (user_id = public.app_current_user_id())
  WITH CHECK (user_id = public.app_current_user_id());

-- daily_status 원본 선택에 "이 친구(호출자)에게 숨겼는지" 조건을 추가.
CREATE OR REPLACE FUNCTION public.get_friends_daily_status(p_date DATE)
RETURNS TABLE(user_id UUID, slot TEXT, status TEXT, meal_time TIME, end_time TIME, is_hidden BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT ds.user_id, ds.slot, ds.status, ds.meal_time, ds.end_time, ds.is_hidden
  FROM daily_status ds
  WHERE ds.date = p_date
    AND ds.user_id IN (
      SELECT CASE WHEN fr.from_user_id = public.app_current_user_id() THEN fr.to_user_id ELSE fr.from_user_id END
      FROM friend_requests fr
      WHERE fr.status = 'accepted'
        AND (fr.from_user_id = public.app_current_user_id() OR fr.to_user_id = public.app_current_user_id())
    )
    AND NOT EXISTS (
      SELECT 1 FROM friend_share_settings fss
      WHERE fss.user_id = ds.user_id AND fss.friend_id = public.app_current_user_id()
        AND fss.date = p_date AND fss.is_shared = false
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_friends_daily_status(DATE) TO authenticated;

-- 팟 참여 선택에도 동일한 조건 추가. add_friend_status.sql을 아직 최신 버전으로 재실행하지
-- 않은 환경(same_pot_as_me 없는 이전 시그니처)이 있을 수 있어 안전하게 먼저 지우고 만든다.
DROP FUNCTION IF EXISTS public.get_friends_pot_participation(DATE);

CREATE OR REPLACE FUNCTION public.get_friends_pot_participation(p_date DATE)
RETURNS TABLE(user_id UUID, slot TEXT, meal_time TEXT, end_time TEXT, same_pot_as_me BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT pm.user_id, mp.slot, mp.meal_time::text, mp.end_time::text,
    EXISTS (
      SELECT 1 FROM pot_members pm2
      WHERE pm2.pot_id = mp.id AND pm2.user_id = public.app_current_user_id()
    ) AS same_pot_as_me
  FROM pot_members pm
  JOIN meal_pots mp ON mp.id = pm.pot_id
  WHERE mp.date = p_date
    AND pm.user_id IN (
      SELECT CASE WHEN fr.from_user_id = public.app_current_user_id() THEN fr.to_user_id ELSE fr.from_user_id END
      FROM friend_requests fr
      WHERE fr.status = 'accepted'
        AND (fr.from_user_id = public.app_current_user_id() OR fr.to_user_id = public.app_current_user_id())
    )
    AND NOT EXISTS (
      SELECT 1 FROM friend_share_settings fss
      WHERE fss.user_id = pm.user_id AND fss.friend_id = public.app_current_user_id()
        AND fss.date = p_date AND fss.is_shared = false
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_friends_pot_participation(DATE) TO authenticated;
