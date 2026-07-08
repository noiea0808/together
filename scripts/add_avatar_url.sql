-- 사용자 프로필 아이콘(사진) 지원
-- Supabase SQL Editor에서 실행하세요.

-- 1) users 테이블에 avatar_url 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2) 아바타 이미지를 저장할 public 스토리지 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 3) 스토리지 RLS 정책 — 파일 경로는 `{auth.uid()}/avatar.<ext>` 형식 사용
-- 누구나 아바타 이미지를 읽을 수 있음 (public 버킷)
CREATE POLICY "avatars_public_read" ON storage.objects
FOR SELECT
USING (bucket_id = 'avatars');

-- 로그인한 사용자는 자신의 폴더(auth.uid())에만 업로드 가능
CREATE POLICY "avatars_own_upload" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 로그인한 사용자는 자신의 폴더 파일만 교체(재업로드) 가능
CREATE POLICY "avatars_own_update" ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 로그인한 사용자는 자신의 폴더 파일만 삭제 가능
CREATE POLICY "avatars_own_delete" ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
