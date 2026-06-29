-- group_members 테이블에 사용자별 그룹 정렬 순서 컬럼 추가
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS sort_order INT;
