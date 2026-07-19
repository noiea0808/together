-- 점심 상태 미설정 리마인드 알림 — pg_cron 스케줄 설정
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)
--
-- 사전 준비:
--   1. supabase functions deploy lunch-reminder 로 Edge Function을 먼저 배포하세요.
--   2. Supabase 대시보드 → Database → Extensions 에서 pg_cron, pg_net 을 활성화하세요.
--   3. 아래 <SERVICE_ROLE_KEY> 를 실제 값으로 바꾼 뒤 실행하세요. (PROJECT_REF는 이미 채워둠)
--      (SERVICE_ROLE_KEY는 대시보드 Settings → API 에서 확인 — 절대 커밋하지 마세요.)
--
-- 동작 방식: 어드민에서 설정한 발송 시각(lunch_reminder_config.send_time, 기본 09:30 KST)은
-- pg_cron 스케줄 자체를 매번 바꾸지 않고, 10분 간격으로 Edge Function을 호출해 함수 내부에서
-- "지금이 발송 시각을 지났고 오늘 아직 안 보냈는지, 주말/공휴일은 아닌지"를 판단한다.
-- UTC와 KST(UTC+9) 요일이 날짜 경계에서 어긋나기 때문에(예: KST 월요일 08~09시 = UTC 일요일
-- 23시대) 크론 자체에서 요일(day-of-week)까지 걸러내려 하면 실수하기 쉽다. 그래서 크론은
-- 매일 KST 08:00~10:59(=UTC 23,0,1시대)에 10분 간격으로만 돌리고, 평일 여부·공휴일 여부·
-- 이미 보냈는지는 전부 lunch-reminder 함수 내부(nowInKst 기반) 판단에 맡긴다.

SELECT cron.unschedule('lunch-reminder') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'lunch-reminder'
);

SELECT cron.schedule(
  'lunch-reminder',
  '*/10 23,0,1 * * *',  -- 매일 UTC 23,0,1시대 10분 간격 = 매일 KST 08:00~10:59. 평일 판단은 함수 내부에서.
  $$
  SELECT net.http_post(
    url := 'https://lxpbfgsoijpcwxabqela.supabase.co/functions/v1/lunch-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
