-- 카톡 등으로 공유되는 초대 링크(그룹/밥팟)의 미리보기 카드에 실제 정보를 보여주기 위한 RPC.
-- Vercel Edge Middleware(middleware.js)가 로그인 없이(anon key로) 호출하므로,
-- groups/meal_pots 테이블 자체의 RLS를 열어주는 대신 필요한 컬럼만 반환하는
-- SECURITY DEFINER 함수로 최소한만 공개한다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE OR REPLACE FUNCTION public.get_group_invite_preview(p_code TEXT)
RETURNS TABLE(name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.name
  FROM groups g
  WHERE g.invite_code = upper(p_code)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_invite_preview(TEXT) TO anon, authenticated;

-- meal_time/end_time 컬럼의 실제 타입(time/timetz 등)과 무관하게 동작하도록 text로 캐스팅해서 반환한다.
CREATE OR REPLACE FUNCTION public.get_pot_invite_preview(p_id UUID)
RETURNS TABLE(title TEXT, slot TEXT, meal_time TEXT, end_time TEXT, menu TEXT, group_name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mp.title, mp.slot, mp.meal_time::text, mp.end_time::text, mp.menu, g.name AS group_name
  FROM meal_pots mp
  JOIN groups g ON g.id = mp.group_id
  WHERE mp.id = p_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_pot_invite_preview(UUID) TO anon, authenticated;
