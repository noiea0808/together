-- 밥팟 사진/코멘트 '개수만' 조회하는 RPC
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
--
-- pot_photos/pot_comments의 SELECT RLS(add_moment_scope.sql)는 moment_scope='participants'인
-- 밥팟은 비참여자에게 행을 아예 안 내려준다. 그래서 클라이언트가 일반 select(head:true)로
-- 개수만 세려 해도 RLS에 걸려 0이 나온다 — '참여하면 볼 수 있어요' 안내에 쓸 실제 개수를
-- 보여주려면 RLS를 우회하는 SECURITY DEFINER 함수가 필요하다.
--
-- 다만 아무나 호출하게 두면 pot_id만 알면 무관한 그룹의 밥팟 개수까지 셀 수 있으니,
-- 최소한 그 밥팟이 속한 그룹의 멤버인지는 검증한다(이 앱에서 밥팟 상세는 항상 자기 그룹
-- 컨텍스트에서만 들어오므로, 그룹 멤버라는 조건이면 충분히 안전하다).

CREATE OR REPLACE FUNCTION public.get_pot_photos_count(p_pot_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM meal_pots WHERE id = p_pot_id AND group_id IN (SELECT public.app_my_group_ids())
  ) THEN
    RAISE EXCEPTION 'not a member of this pot''s group';
  END IF;

  SELECT count(*) INTO v_count FROM pot_photos WHERE pot_id = p_pot_id;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pot_photos_count(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_pot_comments_count(p_pot_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM meal_pots WHERE id = p_pot_id AND group_id IN (SELECT public.app_my_group_ids())
  ) THEN
    RAISE EXCEPTION 'not a member of this pot''s group';
  END IF;

  SELECT count(*) INTO v_count FROM pot_comments WHERE pot_id = p_pot_id;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pot_comments_count(uuid) TO authenticated;
