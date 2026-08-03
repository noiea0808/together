-- 그룹 검색 기능: 이름 부분일치 검색(3자 이상) + 검색 허용 그룹은 비밀번호로만 참여
-- Supabase SQL Editor에서 실행하세요. (멱등 — 여러 번 실행해도 안전)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) 검색 설정 — groups 테이블에 직접 컬럼을 두지 않는 이유:
-- groups는 "invite_code IS NOT NULL"이면 전체 SELECT를 허용하는 느슨한 RLS 정책이 이미 있어서
-- (scripts/fix_group_invite_rls.sql), 비밀번호 해시를 같은 테이블에 두면 그 정책을 타고 새어나간다.
-- 별도 테이블로 분리하고 RLS만 켠 채 정책은 하나도 만들지 않아, 아래 SECURITY DEFINER 함수를
-- 통하지 않으면 아무도(소유자 포함) 직접 조회/수정할 수 없게 막는다.
CREATE TABLE IF NOT EXISTS group_search_settings (
  group_id UUID PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
  allow_search BOOLEAN NOT NULL DEFAULT false,
  password_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE group_search_settings ENABLE ROW LEVEL SECURITY;

-- 2) 비밀번호 시도 기록 — 그룹 단위가 아니라 (유저, 그룹) 단위로 잠가서, 한 사람이 일부러
-- 계속 틀려도 다른 사람의 정상 참여까지 막는 전체 잠금(DoS)이 되지 않게 한다.
CREATE TABLE IF NOT EXISTS group_join_attempts (
  user_id UUID NOT NULL,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  fail_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  PRIMARY KEY (user_id, group_id)
);
ALTER TABLE group_join_attempts ENABLE ROW LEVEL SECURITY;

-- 3) 검색 — allow_search=true인 그룹만, 이름 부분일치, 내가 이미 속한 그룹은 제외.
-- 이름/멤버수만 반환하고 비밀번호 설정 여부조차 알려주지 않는다.
CREATE OR REPLACE FUNCTION public.search_groups(p_query TEXT)
RETURNS TABLE(id UUID, name TEXT, member_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  me UUID := public.app_current_user_id();
  q TEXT := trim(p_query);
BEGIN
  IF me IS NULL OR length(q) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT g.id, g.name, count(gm2.user_id) AS member_count
  FROM groups g
  JOIN group_search_settings s ON s.group_id = g.id AND s.allow_search = true
  LEFT JOIN group_members gm2 ON gm2.group_id = g.id
  WHERE g.name ILIKE '%' || q || '%'
    AND NOT EXISTS (
      SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = me
    )
  GROUP BY g.id, g.name
  ORDER BY g.name
  LIMIT 20;
END;
$$;
GRANT EXECUTE ON FUNCTION public.search_groups(TEXT) TO authenticated;

-- 4) 방장이 그룹 설정 시트에서 현재 상태를 확인 — 해시 자체는 절대 내려주지 않고
-- 비밀번호가 설정되어 있는지 여부만 boolean으로 알려준다.
CREATE OR REPLACE FUNCTION public.get_group_search_settings(p_group_id UUID)
RETURNS TABLE(allow_search BOOLEAN, has_password BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(s.allow_search, false), (s.password_hash IS NOT NULL)
  FROM groups g
  LEFT JOIN group_search_settings s ON s.group_id = g.id
  WHERE g.id = p_group_id AND g.created_by = public.app_current_user_id();
$$;
GRANT EXECUTE ON FUNCTION public.get_group_search_settings(UUID) TO authenticated;

-- 5) 방장이 비밀번호를 설정/변경. 검색 허용을 끈 상태에서도 미리 설정해둘 수 있고,
-- 다시 켤 때 새로 입력하지 않으면 기존 비밀번호가 그대로 유지된다.
-- search_path에 extensions를 함께 잡는 이유: Supabase는 pgcrypto를 public이 아니라
-- extensions 스키마에 설치하는 게 기본값이라, public만 잡으면 crypt/gen_salt를 못 찾는다.
CREATE OR REPLACE FUNCTION public.set_group_password(p_group_id UUID, p_password TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM groups WHERE id = p_group_id AND created_by = public.app_current_user_id()) THEN
    RAISE EXCEPTION '방장만 설정할 수 있어요';
  END IF;
  IF length(trim(p_password)) < 4 THEN
    RAISE EXCEPTION '비밀번호는 4자 이상이어야 해요';
  END IF;

  INSERT INTO group_search_settings (group_id, password_hash, updated_at)
  VALUES (p_group_id, crypt(p_password, gen_salt('bf')), now())
  ON CONFLICT (group_id) DO UPDATE
    SET password_hash = excluded.password_hash, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_group_password(UUID, TEXT) TO authenticated;

-- 6) 방장이 검색 허용을 켜고 끈다. 켤 때 비밀번호가 아직 없으면 막는다
-- (검색 허용은 비밀번호가 설정된 그룹만 가능하다는 전제).
CREATE OR REPLACE FUNCTION public.set_group_allow_search(p_group_id UUID, p_allow BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_pw BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM groups WHERE id = p_group_id AND created_by = public.app_current_user_id()) THEN
    RAISE EXCEPTION '방장만 설정할 수 있어요';
  END IF;

  IF p_allow THEN
    SELECT (password_hash IS NOT NULL) INTO has_pw FROM group_search_settings WHERE group_id = p_group_id;
    IF NOT COALESCE(has_pw, false) THEN
      RAISE EXCEPTION '먼저 비밀번호를 설정해주세요';
    END IF;
  END IF;

  INSERT INTO group_search_settings (group_id, allow_search, updated_at)
  VALUES (p_group_id, p_allow, now())
  ON CONFLICT (group_id) DO UPDATE
    SET allow_search = excluded.allow_search, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_group_allow_search(UUID, BOOLEAN) TO authenticated;

-- 7) 검색으로 찾은 그룹에 비밀번호로 참여. 5회 틀리면 5분 잠금(유저+그룹 단위).
CREATE OR REPLACE FUNCTION public.join_group_by_password(p_group_id UUID, p_password TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  me UUID := public.app_current_user_id();
  v_allow BOOLEAN;
  v_hash TEXT;
  v_fail_count INT;
  v_locked_until TIMESTAMPTZ;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION '로그인이 필요해요';
  END IF;

  SELECT fail_count, locked_until INTO v_fail_count, v_locked_until
  FROM group_join_attempts WHERE user_id = me AND group_id = p_group_id;

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RAISE EXCEPTION '비밀번호를 너무 많이 틀렸어요. 잠시 후 다시 시도해주세요.';
  END IF;

  SELECT s.allow_search, s.password_hash INTO v_allow, v_hash
  FROM group_search_settings s WHERE s.group_id = p_group_id;

  IF NOT COALESCE(v_allow, false) OR v_hash IS NULL THEN
    RAISE EXCEPTION '참여할 수 없는 그룹이에요';
  END IF;

  IF crypt(p_password, v_hash) <> v_hash THEN
    INSERT INTO group_join_attempts (user_id, group_id, fail_count, locked_until)
    VALUES (me, p_group_id, 1, NULL)
    ON CONFLICT (user_id, group_id) DO UPDATE SET
      fail_count = group_join_attempts.fail_count + 1,
      locked_until = CASE WHEN group_join_attempts.fail_count + 1 >= 5
                           THEN now() + interval '5 minutes' ELSE NULL END;
    RAISE EXCEPTION '비밀번호가 틀렸어요';
  END IF;

  DELETE FROM group_join_attempts WHERE user_id = me AND group_id = p_group_id;

  INSERT INTO group_members (group_id, user_id)
  VALUES (p_group_id, me)
  ON CONFLICT (group_id, user_id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.join_group_by_password(UUID, TEXT) TO authenticated;
