-- 같은 기기/앱에서 계정을 바꿔가며 로그인하면(로그아웃 후 다른 계정으로 재로그인,
-- 테스트 계정 전환 등), 그 기기의 FCM 토큰이 이전 계정 소유로 이미 저장돼 있어 새 계정이
-- upsert(on_conflict=token)를 시도할 때 RLS(fcm_tokens_update_own)에 막혀 조용히
-- 실패한다(src/lib/push.js의 registerNativePush가 reject하지만 syncPushSubscription의
-- try/catch가 이를 삼켜 사용자에게는 아무 표시도 없이 그냥 푸시 알림이 안 오게 된다).
-- token은 계정이 아니라 "이 기기의 이 앱 설치" 단위로 고정되는 값이라, 지금 로그인한
-- 사람이 그 토큰의 실질적인 새 소유자다 — push_subscriptions와 동일한 이유로
-- SECURITY DEFINER 함수로 재할당을 허용한다(fix_push_subscriptions_reclaim.sql 참고).
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE OR REPLACE FUNCTION public.claim_fcm_token(p_token TEXT, p_platform TEXT DEFAULT 'android')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  INSERT INTO fcm_tokens (user_id, token, platform)
  VALUES (me, p_token, p_platform)
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_fcm_token(TEXT, TEXT) TO authenticated;
