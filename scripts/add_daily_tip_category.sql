-- 오늘의 팁 팝업에 "'같이먹자' 시작하기" 탭을 추가한다. 같은 daily_tips 테이블을
-- category로 구분해 재사용한다 — tip(랜덤 노출) / guide(순서대로 노출, 신규 이용자용).
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

ALTER TABLE daily_tips ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'tip';
ALTER TABLE daily_tips DROP CONSTRAINT IF EXISTS daily_tips_category_check;
ALTER TABLE daily_tips ADD CONSTRAINT daily_tips_category_check
  CHECK (category IN ('tip', 'guide'));

-- guide 카테고리는 랜덤이 아닌 순서대로 노출되므로 정렬 순서가 필요하다.
ALTER TABLE daily_tips ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
