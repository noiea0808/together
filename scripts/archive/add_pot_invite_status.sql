-- 밥팟 초대(invitePotFriend, event_type='invite') 알림에 수락/거절 상태를 저장한다.
-- 기존 "제안"(invite_new, pot_invitations.status)과 달리 이 초대는 이미 있는 밥팟에 그냥
-- 초대하는 거라 별도 테이블이 없었는데, 알림함에서 수락/거절 버튼을 보여주고 밥팟 상세
-- 화면의 참여 상태와 동기화하려면 상태를 어딘가에 저장해야 해서 notifications에 컬럼을 얹는다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS invite_status TEXT;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_invite_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_invite_status_check
  CHECK (invite_status IS NULL OR invite_status IN ('pending', 'accepted', 'declined'));

-- notifications_update_own(add_notifications.sql)이 이미 본인 행 전체 컬럼 수정을 허용하므로
-- 별도 RLS 정책은 필요 없다.
