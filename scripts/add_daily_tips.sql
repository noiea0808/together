-- 오늘의 팁: 로그인 후 접속마다 뜨는 팁 팝업(어드민에서 텍스트+사진으로 관리)
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE TABLE IF NOT EXISTS daily_tips (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content    TEXT NOT NULL,
  image_url  TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_tips ENABLE ROW LEVEL SECURITY;

-- 팁은 누구나 조회 가능 (로그인 직후 팝업에서 노출)
DROP POLICY IF EXISTS "daily_tips_select_all" ON daily_tips;
CREATE POLICY "daily_tips_select_all" ON daily_tips
  FOR SELECT USING (true);

-- 작성/수정/삭제는 인증된 사용자(어드민 페이지 운영자)에게 허용
-- ※ terms 테이블과 동일하게, 현재 앱은 어드민 라우트 접근만으로 운영하므로 별도 role 없이 authenticated 로 둡니다.
DROP POLICY IF EXISTS "daily_tips_write_authenticated" ON daily_tips;
CREATE POLICY "daily_tips_write_authenticated" ON daily_tips
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 팁 이미지를 저장할 public 스토리지 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('daily-tips', 'daily-tips', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "daily_tips_storage_public_read" ON storage.objects;
DROP POLICY IF EXISTS "daily_tips_storage_authenticated_write" ON storage.objects;
DROP POLICY IF EXISTS "daily_tips_storage_authenticated_delete" ON storage.objects;

-- 누구나 팁 이미지를 읽을 수 있음 (public 버킷)
CREATE POLICY "daily_tips_storage_public_read" ON storage.objects
FOR SELECT
USING (bucket_id = 'daily-tips');

-- 인증된 사용자(어드민 운영자)만 업로드 가능
CREATE POLICY "daily_tips_storage_authenticated_write" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'daily-tips');

-- 인증된 사용자(어드민 운영자)만 삭제 가능
CREATE POLICY "daily_tips_storage_authenticated_delete" ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'daily-tips');
