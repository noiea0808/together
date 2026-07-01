-- meal_pots.meal_time 는 "미정" 상태(시간 미설정)를 null로 표현하도록
-- 앱 코드(createPot/updatePot, PotCard, PotDetailPage 등)에서 이미 전제하고 있으나,
-- 실제 컬럼이 NOT NULL이라 "미정" 저장 시 23502 오류가 발생했다.
alter table public.meal_pots
  alter column meal_time drop not null;
