-- 초대 코드로 그룹을 조회할 수 있도록 RLS 정책 추가
-- (그룹에서 나간 뒤 재참여, 신규 유저 초대 모두 해결)
-- Supabase SQL Editor에서 실행하세요.

-- groups 테이블: 인증된 사용자라면 누구나 초대코드로 그룹 조회 가능
CREATE POLICY "allow_invite_code_lookup" ON groups
FOR SELECT
TO authenticated
USING (invite_code IS NOT NULL);

-- 이미 같은 이름 정책이 있으면 아래로 대체 실행
-- DROP POLICY IF EXISTS "allow_invite_code_lookup" ON groups;
