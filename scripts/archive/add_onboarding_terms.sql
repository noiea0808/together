-- 온보딩 강화: 추가 프로필 항목 + 약관 관리
-- Supabase SQL Editor에서 실행하세요.

-- ── 1. users 테이블 확장 ──────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthdate DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lifestyle TEXT;          -- 학생/주부/직장인/자영업/프리랜서/기타 (선택)
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false;

-- 기존 사용자는 이미 가입을 마친 것으로 간주
UPDATE users SET onboarded = true WHERE onboarded = false;

-- ── 2. 약관 테이블 (어드민 관리) ──────────────────────
CREATE TABLE IF NOT EXISTS terms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL DEFAULT 'tos',   -- 'tos'(이용약관) | 'privacy'(개인정보) | 기타
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  version     TEXT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. 사용자 약관 동의 이력 ──────────────────────────
CREATE TABLE IF NOT EXISTS user_term_agreements (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term_id   UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  agreed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, term_id)
);

-- ── 4. RLS 정책 ───────────────────────────────────────
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_term_agreements ENABLE ROW LEVEL SECURITY;

-- 약관은 누구나 조회 가능 (온보딩에서 노출)
DROP POLICY IF EXISTS "terms_select_all" ON terms;
CREATE POLICY "terms_select_all" ON terms
  FOR SELECT USING (true);

-- 약관 작성/수정/삭제는 인증된 사용자(어드민 페이지 운영자)에게 허용
-- ※ 현재 앱은 어드민 라우트 접근만으로 운영하므로 별도 role 없이 authenticated 로 둡니다.
DROP POLICY IF EXISTS "terms_write_authenticated" ON terms;
CREATE POLICY "terms_write_authenticated" ON terms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 동의 이력: 본인 것만 조회/생성
DROP POLICY IF EXISTS "agreements_select_own" ON user_term_agreements;
CREATE POLICY "agreements_select_own" ON user_term_agreements
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "agreements_insert_own" ON user_term_agreements;
CREATE POLICY "agreements_insert_own" ON user_term_agreements
  FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── 5. 샘플 약관 (원하면 어드민에서 수정/삭제) ─────────
INSERT INTO terms (type, title, content, is_required, sort_order)
VALUES
  ('tos', '이용약관 동의', '여기에 이용약관 본문을 입력하세요. 어드민 페이지에서 수정할 수 있습니다.', true, 1),
  ('privacy', '개인정보 처리방침 동의', '여기에 개인정보 처리방침 본문을 입력하세요. 어드민 페이지에서 수정할 수 있습니다.', true, 2)
ON CONFLICT DO NOTHING;
