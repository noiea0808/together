-- 오늘 화면 "친구 보기"(그룹 없는 친구 상태 조회)용 RPC
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

-- daily_status/meal_pots는 같은 그룹(밥팟) 소속 기준 RLS라 친구가 반드시 같은 그룹에
-- 있으리란 보장이 없으므로 우회가 필요하다 (get_my_friends와 동일한 패턴 — add_friends.sql 참고).
-- 그룹/팟/메뉴 정보는 친구가 아닌 그룹 맥락이라 애초에 내려주지 않는다.

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
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_friends_daily_status(DATE) TO authenticated;

-- meal_pots.meal_time/end_time은 실제 타입(time/text 등)이 일정하지 않을 수 있어
-- text로 캐스팅해서 반환한다 (get_pot_invite_preview와 동일한 패턴 — add_invite_preview_rpc.sql 참고).
-- same_pot_as_me: 친구의 팟 참여가 "나와 같은 팟"인지(같이 먹자 제안을 내가 보내서 같이 있는 경우)
-- 서버에서 미리 계산해 내려준다 — 그룹이 없으니 deriveGroupStatuses의 groupId 비교를 못 쓰는 대신
-- pot_id 자체로 같은 팟인지 판별한다. pot_id/group_id는 여전히 클라이언트에 노출하지 않는다.
-- 리턴 타입(OUT 파라미터 구성)이 바뀌면 CREATE OR REPLACE로는 덮어쓸 수 없어서 먼저 지운다.
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
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_friends_pot_participation(DATE) TO authenticated;
