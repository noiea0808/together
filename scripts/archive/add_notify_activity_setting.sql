-- "활동 알림"(좋아요/댓글/초대 등)을 "점심 상태 리마인드"와 독립적으로 켜고 끌 수 있게
-- 사용자별 opt-in 컬럼을 추가한다.
--
-- 지금까지는 활동 알림 전용 컬럼이 없어서 프론트(MyAccountPage)가 "푸시 구독이 있는지"만으로
-- 활동 알림 on/off를 판단했다. 그런데 리마인드 발송에도 같은 푸시 구독이 필요해서, 구독이
-- 없는 상태에서 리마인드만 켜면 그 시점에 구독을 만들어주는데 그러면 활동 알림 토글도
-- 덩달아 켜진 것처럼 보였다. 이제 두 기능 다 각자의 opt-in 컬럼만 보고, 구독은 둘 중
-- 하나라도 켜져 있으면 유지되는 순수 인프라로 분리한다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_activity BOOLEAN NOT NULL DEFAULT true;
