-- "'같이먹자' 시작하기" 탭 초기 콘텐츠 8종 (GuidePage.jsx 사용법 내용을 재구성)
-- Supabase SQL Editor에서 실행하세요. 실행 전 daily_tips에 category/sort_order 컬럼이
-- 있어야 합니다 (scripts/add_daily_tip_category.sql 선행 필요).
-- 재실행해도 중복 등록되지 않도록, 먼저 같은 콘텐츠가 있는지 확인 후 없을 때만 넣습니다.

INSERT INTO daily_tips (category, sort_order, content, is_active)
SELECT 'guide', v.sort_order, v.content, true
FROM (VALUES
  (1, '"점약있어?" 매번 물어보기 귀찮았죠?
서로 오늘 상태를 미리 알려두면, 누구와 밥 먹을지 훨씬 쉽게 정할 수 있어요 🍚'),
  (2, '이것만 알면 돼요

👥 그룹 — 같이 밥 먹는 사람들의 모임
⏰ 슬롯 — 아침·점심·저녁처럼 밥 먹을 시간
🍲 밥팟 — 그 시간에 실제로 만들어지는 식사 약속'),
  (3, '1단계 · 그룹에 들어가기
그룹을 만들거나, 초대 링크로 참여해보세요.'),
  (4, '2단계 · 오늘 상태 알려두기
같이 먹어요 / 약속 있어요 / 패스할게요 중에서 골라두면 끝이에요.'),
  (5, '3단계 · 밥팟 만들거나 참여하기
마음 맞는 사람이 보이면 밥팟을 열거나 들어가보세요.'),
  (6, '4단계 · 모먼트 남기기
식사 후 사진과 코멘트를 남겨 함께 공유해보세요.'),
  (7, '이런 것도 있어요

🗺️ 가고 싶은 식당·메뉴 공유
🔍 친구 찾아 그룹 초대
🔔 초대·참여·댓글 알림까지 챙겨요'),
  (8, '이제 오늘 누구와 먹을지 정해볼까요?
지금 바로 상태를 알려주세요!')
) AS v(sort_order, content)
WHERE NOT EXISTS (
  SELECT 1 FROM daily_tips t WHERE t.category = 'guide' AND t.content = v.content
);
