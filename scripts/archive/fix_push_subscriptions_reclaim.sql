-- 같은 브라우저에서 계정을 바꿔가며 로그인하면(로그아웃 후 다른 계정으로 재로그인 등),
-- 그 브라우저의 푸시 구독 endpoint가 이전 계정 소유로 이미 저장돼 있어 새 계정이
-- upsert(on_conflict=endpoint)를 시도할 때 RLS(push_subscriptions_update_own)에
-- 막혀 403이 난다. endpoint는 계정이 아니라 "이 브라우저" 단위로 고정되는 값이라,
-- 지금 로그인한 사람이 그 브라우저의 실질적인 새 소유자다 — 그 재할당을 허용할 방법이
-- RLS 정책만으로는 없어서 SECURITY DEFINER 함수로 우회한다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE OR REPLACE FUNCTION public.claim_push_subscription(p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT)
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

  INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
  VALUES (me, p_endpoint, p_p256dh, p_auth)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_push_subscription(TEXT, TEXT, TEXT) TO authenticated;
