-- 약관 재동의 지원
-- 동의 당시의 terms.version 값을 user_term_agreements에 함께 저장해서,
-- 관리자가 필수 약관의 version을 올리면 기존 동의자도 다음 로그인 때 재동의하도록 만든다.
-- (동일 term_id라도 agreed_version이 현재 terms.version과 다르면 "동의 안 한 것"으로 취급)
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE user_term_agreements ADD COLUMN IF NOT EXISTS agreed_version TEXT;

-- 재동의 시 기존 (user_id, term_id) 행을 upsert로 갱신하려면 UPDATE 정책이 필요하다
-- (INSERT ... ON CONFLICT DO UPDATE 는 RLS상 UPDATE 권한도 함께 검사한다).
DROP POLICY IF EXISTS "agreements_update_own" ON user_term_agreements;
CREATE POLICY "agreements_update_own" ON user_term_agreements
  FOR UPDATE TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
