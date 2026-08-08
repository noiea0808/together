# 아카이브된 SQL 스크립트

여기 있는 60개 SQL 파일은 2026-08-08 이전에 Supabase SQL Editor에서 수동으로 실행하며
스키마를 누적 관리하던 방식의 흔적이다. 실행 순서가 보장되지 않았고 정식 마이그레이션
이력에도 반영되지 않아, 새 프로젝트나 장애 복구 환경에서 동일한 스키마를 재현할 방법이
없었다.

지금은 이 파일들의 누적 결과가 [supabase/migrations/20260808000000_baseline_schema.sql](../../supabase/migrations/20260808000000_baseline_schema.sql)
하나로 통합되어 있다. **이 폴더의 파일들은 실행하지 말 것** — 이미 baseline에 반영되어
있고, 그중 일부는 이후 다른 스크립트로 덮어써지거나 되돌려진 상태라 순서대로 다시 실행하면
오히려 현재 스키마와 어긋난다. 과거에 어떤 변경이 어떤 의도로 있었는지 찾아볼 때 참고용으로만
남겨둔다.

앞으로 스키마를 바꿀 땐 `supabase migration new <name>`으로 `supabase/migrations/`에
새 파일을 추가하고 `supabase db push`로 반영한다.
