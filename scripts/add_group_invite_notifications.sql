-- 그룹 초대하기(친구 선택 탭)에서 특정 유저에게 알림을 보내기 위한 컬럼 + RLS.
-- 기존 notifications 테이블은 pot_id 기준(app_my_pot_ids)으로만 insert를 허용해서,
-- 밥팟과 무관한 그룹 초대 알림은 그대로 넣을 수 없다. group_id 컬럼과 같은 방식의
-- app_my_group_ids() 헬퍼 + 별도 permissive INSERT 정책을 추가한다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.app_my_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT group_id FROM public.group_members WHERE user_id = public.app_current_user_id()
$$;

GRANT EXECUTE ON FUNCTION public.app_my_group_ids() TO authenticated, anon;

DROP POLICY IF EXISTS "notifications_insert_sharedgroup" ON notifications;

-- 같은 그룹 멤버에게만 초대 알림 생성 가능 (기존 pot_id 정책과 permissive OR로 결합됨)
CREATE POLICY "notifications_insert_sharedgroup" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (group_id IN (SELECT public.app_my_group_ids()));
