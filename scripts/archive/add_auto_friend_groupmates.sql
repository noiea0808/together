-- 그룹 멤버 자동 친구 등록: 양쪽 다 이 설정을 켜둔 경우에만, 같은 그룹에 있게 되는 순간
-- 자동으로 accepted 상태의 친구 관계를 맺는다. 한쪽만 켜져 있으면 아무 일도 없다(양쪽 동의 필요).
-- 설정을 켜는 시점엔 이미 같은 그룹에 있는 사람들과도 한번에 소급 적용된다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_friend_groupmates BOOLEAN NOT NULL DEFAULT false;

-- p_user_id 기준으로, 이 설정이 켜져 있을 때만 동작한다. 같은 그룹의 다른 멤버 중
-- 마찬가지로 설정을 켠 사람만 골라, 아직 friend_requests에 (어떤 상태로든) 아무 행도
-- 없는 경우에만 accepted 상태로 새로 맺는다 — 예전에 거절했던 사이는 자동으로 되살리지 않는다.
CREATE OR REPLACE FUNCTION public.sync_auto_friend_groupmates(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me_enabled BOOLEAN;
BEGIN
  SELECT auto_friend_groupmates INTO me_enabled FROM users WHERE id = p_user_id;
  IF NOT COALESCE(me_enabled, false) THEN
    RETURN;
  END IF;

  INSERT INTO friend_requests (from_user_id, to_user_id, status, responded_at)
  SELECT p_user_id, other.id, 'accepted', now()
  FROM (
    SELECT DISTINCT u2.id
    FROM group_members gm1
    JOIN group_members gm2 ON gm2.group_id = gm1.group_id AND gm2.user_id != p_user_id
    JOIN users u2 ON u2.id = gm2.user_id
    WHERE gm1.user_id = p_user_id
      AND u2.auto_friend_groupmates = true
      AND u2.is_guest = false
  ) other
  WHERE NOT EXISTS (
    SELECT 1 FROM friend_requests fr
    WHERE (fr.from_user_id = p_user_id AND fr.to_user_id = other.id)
       OR (fr.from_user_id = other.id AND fr.to_user_id = p_user_id)
  );
END;
$$;

-- 새로 그룹에 들어오는 순간에도 같은 로직이 자동으로 돌아가도록 트리거로 연결.
CREATE OR REPLACE FUNCTION public.trg_group_members_auto_friend()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_auto_friend_groupmates(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_members_auto_friend ON group_members;
CREATE TRIGGER group_members_auto_friend
AFTER INSERT ON group_members
FOR EACH ROW EXECUTE FUNCTION public.trg_group_members_auto_friend();

-- 내 계정 설정 화면에서 토글할 때 쓰는 RPC. 켜는 순간 기존 그룹 멤버들과 소급 적용된다.
CREATE OR REPLACE FUNCTION public.set_auto_friend_groupmates(p_enabled BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION '로그인이 필요해요';
  END IF;

  UPDATE users SET auto_friend_groupmates = p_enabled WHERE id = me;

  IF p_enabled THEN
    PERFORM public.sync_auto_friend_groupmates(me);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_auto_friend_groupmates(BOOLEAN) TO authenticated;
