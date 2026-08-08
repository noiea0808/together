-- 회원가입 생년월일 입력을 주민등록번호 앞 6자리 + 성별 구분 숫자 1자리 방식으로 변경하며
-- 성별을 별도 컬럼으로 저장한다. Supabase SQL Editor에서 실행하세요.

ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female'));
