-- 밥팟 사진 등록 기능
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE TABLE IF NOT EXISTS pot_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id UUID NOT NULL REFERENCES meal_pots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pot_photos_pot_id_idx ON pot_photos(pot_id);

ALTER TABLE pot_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pot_photos_select_member" ON pot_photos;
DROP POLICY IF EXISTS "pot_photos_insert_own" ON pot_photos;
DROP POLICY IF EXISTS "pot_photos_delete_own" ON pot_photos;

-- 내가 참여한 밥팟의 사진만 조회 가능
CREATE POLICY "pot_photos_select_member" ON pot_photos
  FOR SELECT TO authenticated
  USING (pot_id IN (SELECT public.app_my_pot_ids()));

-- 내가 참여한 밥팟에, 본인 명의로만 등록 가능
CREATE POLICY "pot_photos_insert_own" ON pot_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.app_current_user_id()
    AND pot_id IN (SELECT public.app_my_pot_ids())
  );

-- 본인 사진만 삭제 가능
CREATE POLICY "pot_photos_delete_own" ON pot_photos
  FOR DELETE TO authenticated
  USING (user_id = public.app_current_user_id());

-- 사진 파일을 저장할 public 스토리지 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('pot-photos', 'pot-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 스토리지 RLS 정책 — 파일 경로는 `{auth.uid()}/{pot_id}/<파일명>` 형식 사용
DROP POLICY IF EXISTS "pot_photos_storage_public_read" ON storage.objects;
DROP POLICY IF EXISTS "pot_photos_storage_own_upload" ON storage.objects;
DROP POLICY IF EXISTS "pot_photos_storage_own_delete" ON storage.objects;

-- 누구나 밥팟 사진을 읽을 수 있음 (public 버킷)
CREATE POLICY "pot_photos_storage_public_read" ON storage.objects
FOR SELECT
USING (bucket_id = 'pot-photos');

-- 로그인한 사용자는 자신의 폴더(auth.uid())에만 업로드 가능
CREATE POLICY "pot_photos_storage_own_upload" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pot-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 로그인한 사용자는 자신의 폴더 파일만 삭제 가능
CREATE POLICY "pot_photos_storage_own_delete" ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'pot-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
