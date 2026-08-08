-- 그룹별 상태 공유를 "그룹×슬롯" 단위에서 "그룹" 단위로 단순화한다.
-- 처음부터 그룹 전체를 공유/비공유하는 게 사용자 기대에 맞다고 판단해 슬롯 구분을 없앤다.
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'group_share_settings') THEN
    -- 테이블이 아직 없는 환경(슬롯 단위 버전을 한 번도 만든 적 없는 경우) — 그룹 단위로 바로 생성
    CREATE TABLE group_share_settings (
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      date       DATE NOT NULL,
      is_shared  BOOLEAN NOT NULL DEFAULT true,
      PRIMARY KEY (user_id, group_id, date)
    );
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_share_settings' AND column_name = 'slot'
  ) THEN
    -- 기존 슬롯 단위 데이터를 그룹 단위로 통합 — 같은 (user, group, date)에서
    -- 슬롯 하나라도 비공유(false)였다면 그룹 전체를 비공유로 이관한다(더 보수적인 쪽 유지).
    CREATE TEMP TABLE _group_share_consolidated AS
    SELECT user_id, group_id, date, bool_and(is_shared) AS is_shared
    FROM group_share_settings
    GROUP BY user_id, group_id, date;

    TRUNCATE group_share_settings;
    ALTER TABLE group_share_settings DROP CONSTRAINT IF EXISTS group_share_settings_pkey;
    ALTER TABLE group_share_settings DROP COLUMN slot;
    ALTER TABLE group_share_settings ADD PRIMARY KEY (user_id, group_id, date);

    INSERT INTO group_share_settings (user_id, group_id, date, is_shared)
    SELECT user_id, group_id, date, is_shared FROM _group_share_consolidated;

    DROP TABLE _group_share_consolidated;
  END IF;
END $$;

ALTER TABLE group_share_settings ENABLE ROW LEVEL SECURITY;

-- 같은 그룹 멤버라면 서로의 공유 설정(비공유 여부)을 볼 수 있어야 보드에서 상태를 걸러낼 수 있다
DROP POLICY IF EXISTS "group_share_settings_select_member" ON group_share_settings;
CREATE POLICY "group_share_settings_select_member" ON group_share_settings
  FOR SELECT TO authenticated
  USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = public.app_current_user_id()));

-- 본인 설정만 등록/수정/삭제 가능
DROP POLICY IF EXISTS "group_share_settings_write_own" ON group_share_settings;
CREATE POLICY "group_share_settings_write_own" ON group_share_settings
  FOR ALL TO authenticated
  USING (user_id = public.app_current_user_id())
  WITH CHECK (user_id = public.app_current_user_id());
