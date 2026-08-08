-- daily_status 테이블에 end_time 컬럼 추가
ALTER TABLE daily_status ADD COLUMN IF NOT EXISTS end_time time;
