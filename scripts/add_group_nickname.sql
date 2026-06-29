-- group_members 테이블에 그룹 전용 닉네임 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS nickname TEXT;
