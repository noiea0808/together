-- 베이스라인 스키마 마이그레이션 (2026-08-08 기준)
--
-- scripts/ 아래 60개 SQL 스크립트로 누적 관리되던 스키마를, 실제 프로덕션 DB(project_id:
-- lxpbfgsoijpcwxabqela)를 pg_catalog로 직접 조회해 재구성한 스냅샷이다. 지금까지는 scripts/
-- 파일들을 순서 보장 없이 Supabase SQL Editor에서 수동 실행해 왔고, 정식 마이그레이션 이력에는
-- 반영되지 않아 새 프로젝트나 장애 복구 환경에서 동일한 스키마를 재현할 방법이 없었다.
--
-- 이 환경엔 Docker가 없어 `supabase db pull`/`db dump`(정상 경로, pg_dump를 도커로 실행)를 쓸 수
-- 없었다. 대신 pg_attribute/pg_constraint/pg_indexes/pg_policies/pg_proc/pg_trigger 등을 직접
-- 조회해 DDL을 재구성했다 — 컬럼 2,416개, 제약조건 115개, 인덱스 19개, RLS 정책 102개, 함수 37개,
-- 트리거 1개, storage 버킷 3개를 전수 대조했다. 다만 신선한 프로젝트에 실제로 적용해 보는 end-to-end
-- 테스트는 하지 못했으니, 재해 복구처럼 이 파일을 100% 신뢰해야 하는 상황이 오면 먼저 임시
-- Supabase 프로젝트에 `supabase db push`로 한 번 적용해 보고 쓰길 권장한다.
--
-- 이 마이그레이션을 실행할 필요는 없다 — 이미 라이브 DB의 실제 상태이므로, 이 버전을
-- `supabase migration repair 20260808000000 --status applied --linked`로 "이미 적용됨"으로
-- 기록해 두었다. 앞으로 스키마를 바꿀 땐 `supabase migration new <name>`으로 새 마이그레이션을
-- 추가하고 `supabase db push`로 반영한다 — scripts/ 에 SQL 파일을 새로 추가하지 않는다.
-- 기존 60개 스크립트는 scripts/archive/ 로 옮겨 히스토리 참고용으로만 남겨둔다.

-- ============================================================
-- 확장 (Extensions)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ============================================================
-- ENUM 타입
-- ============================================================

-- ============================================================
-- 테이블
-- ============================================================

CREATE TABLE public.daily_status (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  group_id uuid,
  date date DEFAULT CURRENT_DATE NOT NULL,
  slot text NOT NULL,
  status text NOT NULL,
  meal_time time without time zone,
  menu text,
  created_at timestamp with time zone DEFAULT now(),
  is_hidden boolean DEFAULT false,
  end_time time without time zone
);

CREATE TABLE public.daily_tips (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  content text NOT NULL,
  image_url text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_featured boolean DEFAULT false NOT NULL,
  category text DEFAULT 'tip'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.fcm_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text DEFAULT 'android'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  reply text,
  replied_at timestamp with time zone,
  replied_by uuid
);

CREATE TABLE public.friend_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  responded_at timestamp with time zone
);

CREATE TABLE public.friend_share_settings (
  user_id uuid NOT NULL,
  friend_id uuid NOT NULL,
  date date NOT NULL,
  is_shared boolean DEFAULT true NOT NULL
);

CREATE TABLE public.group_default_pot_configs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  slot text NOT NULL,
  meal_time time without time zone NOT NULL,
  end_time time without time zone,
  title text NOT NULL,
  max_people integer DEFAULT 4 NOT NULL,
  is_public boolean DEFAULT false NOT NULL,
  effective_from date DEFAULT CURRENT_DATE NOT NULL,
  last_modified_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  memo text,
  icon text,
  repeat_days integer[] DEFAULT '{1,2,3,4,5}'::integer[] NOT NULL
);

CREATE TABLE public.group_join_attempts (
  user_id uuid NOT NULL,
  group_id uuid NOT NULL,
  fail_count integer DEFAULT 0 NOT NULL,
  locked_until timestamp with time zone
);

CREATE TABLE public.group_members (
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamp with time zone DEFAULT now(),
  nickname text,
  sort_order integer
);

CREATE TABLE public.group_search_settings (
  group_id uuid NOT NULL,
  allow_search boolean DEFAULT false NOT NULL,
  password_hash text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.group_share_settings (
  user_id uuid NOT NULL,
  group_id uuid NOT NULL,
  date date NOT NULL,
  is_shared boolean DEFAULT true
);

CREATE TABLE public.groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  invite_code text NOT NULL,
  is_public boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.holidays (
  date date NOT NULL,
  name text NOT NULL
);

CREATE TABLE public.lunch_reminder_config (
  id boolean DEFAULT true NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  send_time time without time zone DEFAULT '09:30:00'::time without time zone NOT NULL,
  last_sent_date date,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  title text DEFAULT '오늘 점심 뭐 드실래요?'::text NOT NULL,
  body text DEFAULT '아직 점심 상태를 안 정하셨어요. 지금 정해두면 눈치 안 봐도 돼요.'::text NOT NULL
);

CREATE TABLE public.meal_pots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid,
  date date DEFAULT CURRENT_DATE NOT NULL,
  slot text NOT NULL,
  meal_time time without time zone,
  title text NOT NULL,
  max_people integer DEFAULT 4 NOT NULL,
  is_public boolean DEFAULT false,
  is_default boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  menu text,
  end_time text,
  last_modified_by uuid,
  last_modified_at timestamp with time zone,
  memo text,
  config_id uuid,
  invite_code text,
  moment_scope text DEFAULT 'participants'::text NOT NULL,
  icon text
);

CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  pot_id uuid,
  title text NOT NULL,
  body text,
  url text,
  is_read boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  event_type text,
  invitation_id uuid,
  group_id uuid,
  friend_request_id uuid,
  wish_place_proposal_id uuid,
  wish_place_like_id uuid,
  wish_place_comment_id uuid,
  wish_place_mention_comment_id uuid,
  invite_status text
);

CREATE TABLE public.pot_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  pot_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.pot_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  date date NOT NULL,
  slot text NOT NULL,
  meal_time time without time zone,
  title text,
  menu text,
  max_people integer DEFAULT 2 NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  pot_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  responded_at timestamp with time zone,
  decline_reason text
);

CREATE TABLE public.pot_members (
  pot_id uuid NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.pot_photos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  pot_id uuid NOT NULL,
  user_id uuid NOT NULL,
  photo_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reporter_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  detail text,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  action_taken text
);

CREATE TABLE public.terms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type text DEFAULT 'tos'::text NOT NULL,
  title text NOT NULL,
  content text DEFAULT ''::text NOT NULL,
  version text,
  is_required boolean DEFAULT true NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_nav_state (
  user_id uuid NOT NULL,
  moments_group_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  moments_public_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  friends_wish_seen_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_term_agreements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  term_id uuid NOT NULL,
  agreed_at timestamp with time zone DEFAULT now() NOT NULL,
  agreed_version text
);

CREATE TABLE public.users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nickname text NOT NULL,
  device_token text,
  created_at timestamp with time zone DEFAULT now(),
  auth_id uuid,
  email text,
  birthdate date,
  lifestyle text,
  onboarded boolean DEFAULT false NOT NULL,
  is_guest boolean DEFAULT false NOT NULL,
  guest_pot_id uuid,
  is_admin boolean DEFAULT false NOT NULL,
  avatar_url text,
  is_discoverable boolean DEFAULT true NOT NULL,
  notify_lunch_reminder boolean DEFAULT true NOT NULL,
  is_suspended boolean DEFAULT false NOT NULL,
  suspended_until timestamp with time zone,
  suspended_reason text,
  last_login_at timestamp with time zone,
  gender text,
  auto_friend_groupmates boolean DEFAULT false NOT NULL,
  notify_activity boolean DEFAULT true NOT NULL,
  active_slots text[] DEFAULT ARRAY['아침'::text, '오전간식'::text, '점심'::text, '오후간식'::text, '저녁'::text, '야식'::text] NOT NULL
);

CREATE TABLE public.wish_place_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  wish_place_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.wish_place_likes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  wish_place_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.wish_place_proposals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  wish_place_id uuid NOT NULL,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  group_id uuid,
  message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.wish_place_shares (
  wish_place_id uuid NOT NULL,
  group_id uuid NOT NULL
);

CREATE TABLE public.wish_places (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  category text DEFAULT 'like'::text NOT NULL,
  preview_title text,
  preview_description text,
  preview_image text,
  preview_site_name text
);

-- ============================================================
-- 제약조건 (PK / UNIQUE / FK / CHECK)
-- ============================================================

ALTER TABLE public.daily_status ADD CONSTRAINT daily_status_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_status ADD CONSTRAINT daily_status_user_date_slot_unique UNIQUE (user_id, date, slot);
ALTER TABLE public.daily_status ADD CONSTRAINT daily_status_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.daily_status ADD CONSTRAINT daily_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.daily_status ADD CONSTRAINT daily_status_status_check CHECK ((status = ANY (ARRAY['open'::text, 'skip'::text, 'closed'::text, '모집중'::text, '참여중'::text])));
ALTER TABLE public.daily_tips ADD CONSTRAINT daily_tips_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_tips ADD CONSTRAINT daily_tips_category_check CHECK ((category = ANY (ARRAY['tip'::text, 'guide'::text])));
ALTER TABLE public.fcm_tokens ADD CONSTRAINT fcm_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.fcm_tokens ADD CONSTRAINT fcm_tokens_token_key UNIQUE (token);
ALTER TABLE public.fcm_tokens ADD CONSTRAINT fcm_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_replied_by_fkey FOREIGN KEY (replied_by) REFERENCES users(id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'answered'::text])));
ALTER TABLE public.friend_requests ADD CONSTRAINT friend_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.friend_requests ADD CONSTRAINT friend_requests_from_user_id_to_user_id_key UNIQUE (from_user_id, to_user_id);
ALTER TABLE public.friend_requests ADD CONSTRAINT friend_requests_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.friend_requests ADD CONSTRAINT friend_requests_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.friend_requests ADD CONSTRAINT friend_requests_check CHECK ((from_user_id <> to_user_id));
ALTER TABLE public.friend_share_settings ADD CONSTRAINT friend_share_settings_pkey PRIMARY KEY (user_id, friend_id, date);
ALTER TABLE public.friend_share_settings ADD CONSTRAINT friend_share_settings_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.friend_share_settings ADD CONSTRAINT friend_share_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.group_default_pot_configs ADD CONSTRAINT group_default_pot_configs_pkey PRIMARY KEY (id);
ALTER TABLE public.group_default_pot_configs ADD CONSTRAINT group_default_pot_configs_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_default_pot_configs ADD CONSTRAINT group_default_pot_configs_last_modified_by_fkey FOREIGN KEY (last_modified_by) REFERENCES users(id);
ALTER TABLE public.group_default_pot_configs ADD CONSTRAINT group_default_pot_configs_icon_check CHECK (((icon IS NULL) OR (icon = ANY (ARRAY['together'::text, 'tray'::text, 'chat'::text, 'salad'::text, 'ready'::text, 'party'::text, 'care'::text, 'map'::text, 'delivery'::text, 'random'::text]))));
ALTER TABLE public.group_default_pot_configs ADD CONSTRAINT group_default_pot_configs_repeat_days_check CHECK (((array_length(repeat_days, 1) > 0) AND (repeat_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6])));
ALTER TABLE public.group_join_attempts ADD CONSTRAINT group_join_attempts_pkey PRIMARY KEY (user_id, group_id);
ALTER TABLE public.group_join_attempts ADD CONSTRAINT group_join_attempts_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_pkey PRIMARY KEY (group_id, user_id);
ALTER TABLE public.group_members ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.group_search_settings ADD CONSTRAINT group_search_settings_pkey PRIMARY KEY (group_id);
ALTER TABLE public.group_search_settings ADD CONSTRAINT group_search_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_share_settings ADD CONSTRAINT group_share_settings_pkey PRIMARY KEY (user_id, group_id, date);
ALTER TABLE public.group_share_settings ADD CONSTRAINT group_share_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id);
ALTER TABLE public.group_share_settings ADD CONSTRAINT group_share_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public.groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
ALTER TABLE public.groups ADD CONSTRAINT groups_invite_code_key UNIQUE (invite_code);
ALTER TABLE public.groups ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.holidays ADD CONSTRAINT holidays_pkey PRIMARY KEY (date);
ALTER TABLE public.lunch_reminder_config ADD CONSTRAINT lunch_reminder_config_pkey PRIMARY KEY (id);
ALTER TABLE public.lunch_reminder_config ADD CONSTRAINT lunch_reminder_config_id_check CHECK (id);
ALTER TABLE public.meal_pots ADD CONSTRAINT meal_pots_pkey PRIMARY KEY (id);
ALTER TABLE public.meal_pots ADD CONSTRAINT meal_pots_config_id_fkey FOREIGN KEY (config_id) REFERENCES group_default_pot_configs(id) ON DELETE SET NULL;
ALTER TABLE public.meal_pots ADD CONSTRAINT meal_pots_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.meal_pots ADD CONSTRAINT meal_pots_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.meal_pots ADD CONSTRAINT meal_pots_last_modified_by_fkey FOREIGN KEY (last_modified_by) REFERENCES users(id);
ALTER TABLE public.meal_pots ADD CONSTRAINT meal_pots_icon_check CHECK (((icon IS NULL) OR (icon = ANY (ARRAY['together'::text, 'tray'::text, 'chat'::text, 'salad'::text, 'ready'::text, 'party'::text, 'care'::text, 'map'::text, 'delivery'::text, 'random'::text]))));
ALTER TABLE public.meal_pots ADD CONSTRAINT meal_pots_moment_scope_check CHECK ((moment_scope = ANY (ARRAY['participants'::text, 'group'::text, 'public'::text])));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_friend_request_id_fkey FOREIGN KEY (friend_request_id) REFERENCES friend_requests(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES pot_invitations(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pot_id_fkey FOREIGN KEY (pot_id) REFERENCES meal_pots(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_wish_place_comment_id_fkey FOREIGN KEY (wish_place_comment_id) REFERENCES wish_place_comments(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_wish_place_like_id_fkey FOREIGN KEY (wish_place_like_id) REFERENCES wish_place_likes(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_wish_place_mention_comment_id_fkey FOREIGN KEY (wish_place_mention_comment_id) REFERENCES wish_place_comments(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_wish_place_proposal_id_fkey FOREIGN KEY (wish_place_proposal_id) REFERENCES wish_place_proposals(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_invite_status_check CHECK (((invite_status IS NULL) OR (invite_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text]))));
ALTER TABLE public.pot_comments ADD CONSTRAINT pot_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.pot_comments ADD CONSTRAINT pot_comments_pot_id_fkey FOREIGN KEY (pot_id) REFERENCES meal_pots(id) ON DELETE CASCADE;
ALTER TABLE public.pot_comments ADD CONSTRAINT pot_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.pot_invitations ADD CONSTRAINT pot_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.pot_invitations ADD CONSTRAINT pot_invitations_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.pot_invitations ADD CONSTRAINT pot_invitations_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.pot_invitations ADD CONSTRAINT pot_invitations_pot_id_fkey FOREIGN KEY (pot_id) REFERENCES meal_pots(id) ON DELETE SET NULL;
ALTER TABLE public.pot_invitations ADD CONSTRAINT pot_invitations_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.pot_members ADD CONSTRAINT pot_members_pkey PRIMARY KEY (pot_id, user_id);
ALTER TABLE public.pot_members ADD CONSTRAINT pot_members_pot_id_fkey FOREIGN KEY (pot_id) REFERENCES meal_pots(id) ON DELETE CASCADE;
ALTER TABLE public.pot_members ADD CONSTRAINT pot_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.pot_photos ADD CONSTRAINT pot_photos_pkey PRIMARY KEY (id);
ALTER TABLE public.pot_photos ADD CONSTRAINT pot_photos_pot_id_fkey FOREIGN KEY (pot_id) REFERENCES meal_pots(id) ON DELETE CASCADE;
ALTER TABLE public.pot_photos ADD CONSTRAINT pot_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.reports ADD CONSTRAINT reports_pkey PRIMARY KEY (id);
ALTER TABLE public.reports ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.reports ADD CONSTRAINT reports_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id);
ALTER TABLE public.reports ADD CONSTRAINT reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewing'::text, 'resolved'::text, 'dismissed'::text])));
ALTER TABLE public.reports ADD CONSTRAINT reports_target_type_check CHECK ((target_type = ANY (ARRAY['pot'::text, 'pot_comment'::text, 'wish_place'::text, 'wish_place_comment'::text, 'user'::text])));
ALTER TABLE public.terms ADD CONSTRAINT terms_pkey PRIMARY KEY (id);
ALTER TABLE public.user_nav_state ADD CONSTRAINT user_nav_state_pkey PRIMARY KEY (user_id);
ALTER TABLE public.user_nav_state ADD CONSTRAINT user_nav_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_term_agreements ADD CONSTRAINT user_term_agreements_pkey PRIMARY KEY (id);
ALTER TABLE public.user_term_agreements ADD CONSTRAINT user_term_agreements_user_id_term_id_key UNIQUE (user_id, term_id);
ALTER TABLE public.user_term_agreements ADD CONSTRAINT user_term_agreements_term_id_fkey FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE;
ALTER TABLE public.user_term_agreements ADD CONSTRAINT user_term_agreements_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.users ADD CONSTRAINT users_auth_id_key UNIQUE (auth_id);
ALTER TABLE public.users ADD CONSTRAINT users_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id);
ALTER TABLE public.users ADD CONSTRAINT users_guest_pot_id_fkey FOREIGN KEY (guest_pot_id) REFERENCES meal_pots(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD CONSTRAINT users_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text])));
ALTER TABLE public.wish_place_comments ADD CONSTRAINT wish_place_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.wish_place_comments ADD CONSTRAINT wish_place_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.wish_place_comments ADD CONSTRAINT wish_place_comments_wish_place_id_fkey FOREIGN KEY (wish_place_id) REFERENCES wish_places(id) ON DELETE CASCADE;
ALTER TABLE public.wish_place_likes ADD CONSTRAINT wish_place_likes_pkey PRIMARY KEY (id);
ALTER TABLE public.wish_place_likes ADD CONSTRAINT wish_place_likes_wish_place_id_user_id_key UNIQUE (wish_place_id, user_id);
ALTER TABLE public.wish_place_likes ADD CONSTRAINT wish_place_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.wish_place_likes ADD CONSTRAINT wish_place_likes_wish_place_id_fkey FOREIGN KEY (wish_place_id) REFERENCES wish_places(id) ON DELETE CASCADE;
ALTER TABLE public.wish_place_proposals ADD CONSTRAINT wish_place_proposals_pkey PRIMARY KEY (id);
ALTER TABLE public.wish_place_proposals ADD CONSTRAINT wish_place_proposals_wish_place_id_from_user_id_key UNIQUE (wish_place_id, from_user_id);
ALTER TABLE public.wish_place_proposals ADD CONSTRAINT wish_place_proposals_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.wish_place_proposals ADD CONSTRAINT wish_place_proposals_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.wish_place_proposals ADD CONSTRAINT wish_place_proposals_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.wish_place_proposals ADD CONSTRAINT wish_place_proposals_wish_place_id_fkey FOREIGN KEY (wish_place_id) REFERENCES wish_places(id) ON DELETE CASCADE;
ALTER TABLE public.wish_place_proposals ADD CONSTRAINT wish_place_proposals_check CHECK ((from_user_id <> to_user_id));
ALTER TABLE public.wish_place_shares ADD CONSTRAINT wish_place_shares_pkey PRIMARY KEY (wish_place_id, group_id);
ALTER TABLE public.wish_place_shares ADD CONSTRAINT wish_place_shares_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.wish_place_shares ADD CONSTRAINT wish_place_shares_wish_place_id_fkey FOREIGN KEY (wish_place_id) REFERENCES wish_places(id) ON DELETE CASCADE;
ALTER TABLE public.wish_places ADD CONSTRAINT wish_places_pkey PRIMARY KEY (id);
ALTER TABLE public.wish_places ADD CONSTRAINT wish_places_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.wish_places ADD CONSTRAINT wish_places_category_check CHECK ((category = ANY (ARRAY['like'::text, 'curious'::text, 'together'::text, 'frequent'::text])));

-- ============================================================
-- 인덱스
-- ============================================================

CREATE INDEX fcm_tokens_user_id_idx ON public.fcm_tokens USING btree (user_id);
CREATE INDEX feedback_status_idx ON public.feedback USING btree (status);
CREATE INDEX feedback_user_id_idx ON public.feedback USING btree (user_id);
CREATE INDEX friend_requests_from_user_idx ON public.friend_requests USING btree (from_user_id, status);
CREATE INDEX friend_requests_to_user_idx ON public.friend_requests USING btree (to_user_id, status);
CREATE UNIQUE INDEX meal_pots_config_date_unique ON public.meal_pots USING btree (group_id, date, config_id) WHERE ((is_default = true) AND (config_id IS NOT NULL));
CREATE INDEX notifications_user_id_created_at_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX pot_comments_pot_id_idx ON public.pot_comments USING btree (pot_id);
CREATE INDEX pot_invitations_from_user_date_idx ON public.pot_invitations USING btree (from_user_id, date);
CREATE INDEX pot_invitations_to_user_status_idx ON public.pot_invitations USING btree (to_user_id, status);
CREATE INDEX pot_photos_pot_id_idx ON public.pot_photos USING btree (pot_id);
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions USING btree (user_id);
CREATE INDEX reports_status_idx ON public.reports USING btree (status);
CREATE INDEX reports_target_idx ON public.reports USING btree (target_type, target_id);
CREATE INDEX wish_place_comments_wish_place_idx ON public.wish_place_comments USING btree (wish_place_id, created_at);
CREATE INDEX wish_place_likes_wish_place_idx ON public.wish_place_likes USING btree (wish_place_id);
CREATE INDEX wish_place_proposals_to_user_idx ON public.wish_place_proposals USING btree (to_user_id, created_at);
CREATE INDEX wish_place_proposals_wish_place_idx ON public.wish_place_proposals USING btree (wish_place_id);
CREATE INDEX wish_places_user_id_idx ON public.wish_places USING btree (user_id, sort_order);

-- ============================================================
-- 함수
-- ============================================================

CREATE OR REPLACE FUNCTION public.app_current_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.app_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT is_admin FROM public.users WHERE auth_id = auth.uid()), false)
$function$;

CREATE OR REPLACE FUNCTION public.app_my_group_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT group_id FROM public.group_members WHERE user_id = public.app_current_user_id()
$function$;

CREATE OR REPLACE FUNCTION public.app_my_pot_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pot_id FROM public.pot_members WHERE user_id = public.app_current_user_id()
$function$;

CREATE OR REPLACE FUNCTION public.auto_confirm_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  new.email_confirmed_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_view_wish_place(p_wish_place_id uuid, p_viewer_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  owner_id UUID;
BEGIN
  SELECT user_id INTO owner_id FROM wish_places WHERE id = p_wish_place_id;
  IF owner_id IS NULL OR p_viewer_id IS NULL THEN
    RETURN false;
  END IF;

  IF owner_id = p_viewer_id THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.user_id = p_viewer_id
      AND gm.group_id IN (SELECT group_id FROM wish_place_shares WHERE wish_place_id = p_wish_place_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_fcm_token(p_token text, p_platform text DEFAULT 'android'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  INSERT INTO fcm_tokens (user_id, token, platform)
  VALUES (me, p_token, p_platform)
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
  VALUES (me, p_endpoint, p_p256dh, p_auth)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_friend_wish_places(target_user_id uuid)
 RETURNS TABLE(id uuid, content text, category text, sort_order integer, created_at timestamp with time zone, restricted boolean, like_count bigint, liked_by_me boolean, comment_count bigint, preview_title text, preview_description text, preview_image text, preview_site_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL OR target_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      wp.id, wp.content, wp.category, wp.sort_order, wp.created_at,
      EXISTS (SELECT 1 FROM wish_place_shares s WHERE s.wish_place_id = wp.id) AS restricted,
      (SELECT count(*) FROM wish_place_likes l WHERE l.wish_place_id = wp.id) AS like_count,
      EXISTS (SELECT 1 FROM wish_place_likes l WHERE l.wish_place_id = wp.id AND l.user_id = me) AS liked_by_me,
      (SELECT count(*) FROM wish_place_comments c WHERE c.wish_place_id = wp.id) AS comment_count,
      wp.preview_title, wp.preview_description, wp.preview_image, wp.preview_site_name
    FROM wish_places wp
    WHERE wp.user_id = target_user_id
      AND public.can_view_wish_place(wp.id, me)
    ORDER BY wp.sort_order ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_friends_daily_status(p_date date)
 RETURNS TABLE(user_id uuid, slot text, status text, meal_time time without time zone, end_time time without time zone, is_hidden boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ds.user_id, ds.slot, ds.status, ds.meal_time, ds.end_time, ds.is_hidden
  FROM daily_status ds
  WHERE ds.date = p_date
    AND ds.user_id IN (
      SELECT CASE WHEN fr.from_user_id = public.app_current_user_id() THEN fr.to_user_id ELSE fr.from_user_id END
      FROM friend_requests fr
      WHERE fr.status = 'accepted'
        AND (fr.from_user_id = public.app_current_user_id() OR fr.to_user_id = public.app_current_user_id())
    )
    AND NOT EXISTS (
      SELECT 1 FROM friend_share_settings fss
      WHERE fss.user_id = ds.user_id AND fss.friend_id = public.app_current_user_id()
        AND fss.date = p_date AND fss.is_shared = false
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_friends_pot_participation(p_date date)
 RETURNS TABLE(user_id uuid, slot text, meal_time text, end_time text, same_pot_as_me boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pm.user_id, mp.slot, mp.meal_time::text, mp.end_time::text,
    EXISTS (
      SELECT 1 FROM pot_members pm2
      WHERE pm2.pot_id = mp.id AND pm2.user_id = public.app_current_user_id()
    ) AS same_pot_as_me
  FROM pot_members pm
  JOIN meal_pots mp ON mp.id = pm.pot_id
  WHERE mp.date = p_date
    AND pm.user_id IN (
      SELECT CASE WHEN fr.from_user_id = public.app_current_user_id() THEN fr.to_user_id ELSE fr.from_user_id END
      FROM friend_requests fr
      WHERE fr.status = 'accepted'
        AND (fr.from_user_id = public.app_current_user_id() OR fr.to_user_id = public.app_current_user_id())
    )
    AND NOT EXISTS (
      SELECT 1 FROM friend_share_settings fss
      WHERE fss.user_id = pm.user_id AND fss.friend_id = public.app_current_user_id()
        AND fss.date = p_date AND fss.is_shared = false
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_group_invite_preview(p_code text)
 RETURNS TABLE(name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT g.name
  FROM groups g
  WHERE g.invite_code = upper(p_code)
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_group_search_settings(p_group_id uuid)
 RETURNS TABLE(allow_search boolean, has_password boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(s.allow_search, false), (s.password_hash IS NOT NULL)
  FROM groups g
  LEFT JOIN group_search_settings s ON s.group_id = g.id
  WHERE g.id = p_group_id AND g.created_by = public.app_current_user_id();
$function$;

CREATE OR REPLACE FUNCTION public.get_my_friend_requests()
 RETURNS TABLE(id uuid, direction text, other_id uuid, other_nickname text, other_avatar_url text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT fr.id,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN 'sent' ELSE 'received' END,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.id ELSE u1.id END,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.nickname ELSE u1.nickname END,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.avatar_url ELSE u1.avatar_url END,
    fr.created_at
  FROM friend_requests fr
  JOIN users u1 ON u1.id = fr.from_user_id
  JOIN users u2 ON u2.id = fr.to_user_id
  WHERE fr.status = 'pending'
    AND (fr.from_user_id = public.app_current_user_id() OR fr.to_user_id = public.app_current_user_id())
  ORDER BY fr.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_friends()
 RETURNS TABLE(request_id uuid, id uuid, nickname text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT fr.id AS request_id,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.id ELSE u1.id END,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.nickname ELSE u1.nickname END,
    CASE WHEN fr.from_user_id = public.app_current_user_id() THEN u2.avatar_url ELSE u1.avatar_url END
  FROM friend_requests fr
  JOIN users u1 ON u1.id = fr.from_user_id
  JOIN users u2 ON u2.id = fr.to_user_id
  WHERE fr.status = 'accepted'
    AND (fr.from_user_id = public.app_current_user_id() OR fr.to_user_id = public.app_current_user_id());
$function$;

CREATE OR REPLACE FUNCTION public.get_my_sent_wish_proposals(p_to_user_id uuid)
 RETURNS TABLE(wish_place_id uuid, group_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT wish_place_id, group_id, created_at
  FROM wish_place_proposals
  WHERE from_user_id = public.app_current_user_id() AND to_user_id = p_to_user_id
$function$;

CREATE OR REPLACE FUNCTION public.get_my_wish_place_proposals()
 RETURNS TABLE(id uuid, wish_place_id uuid, from_user_id uuid, from_nickname text, from_avatar_url text, message text, group_id uuid, group_name text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.wish_place_id, p.from_user_id, u.nickname, u.avatar_url, p.message, p.group_id, g.name, p.created_at
  FROM wish_place_proposals p
  JOIN users u ON u.id = p.from_user_id
  LEFT JOIN groups g ON g.id = p.group_id
  WHERE p.to_user_id = public.app_current_user_id()
  ORDER BY p.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_wish_place_reactions()
 RETURNS TABLE(wish_place_id uuid, like_count bigint, comment_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT wp.id,
    (SELECT count(*) FROM wish_place_likes l WHERE l.wish_place_id = wp.id),
    (SELECT count(*) FROM wish_place_comments c WHERE c.wish_place_id = wp.id)
  FROM wish_places wp
  WHERE wp.user_id = public.app_current_user_id()
$function$;

CREATE OR REPLACE FUNCTION public.get_nav_badges()
 RETURNS TABLE(moments_group boolean, moments_public boolean, friends_wish boolean, friend_ids_with_new_wish uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
  seen RECORD;
  my_group_ids UUID[];
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO user_nav_state (user_id) VALUES (me)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT moments_group_seen_at, moments_public_seen_at, friends_wish_seen_at
    INTO seen
    FROM user_nav_state WHERE user_id = me;

  SELECT array_agg(group_id) INTO my_group_ids FROM group_members WHERE user_id = me;

  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1 FROM meal_pots
      WHERE moment_scope IN ('group', 'public')
        AND group_id = ANY(my_group_ids)
        AND created_at > seen.moments_group_seen_at
    ),
    EXISTS (
      SELECT 1 FROM meal_pots
      WHERE moment_scope = 'public'
        AND created_at > seen.moments_public_seen_at
    ),
    EXISTS (
      SELECT 1 FROM wish_places wp
      WHERE wp.user_id != me
        AND wp.created_at > seen.friends_wish_seen_at
        AND public.can_view_wish_place(wp.id, me)
    ),
    (
      SELECT array_agg(DISTINCT wp.user_id) FROM wish_places wp
      WHERE wp.user_id != me
        AND wp.created_at > seen.friends_wish_seen_at
        AND public.can_view_wish_place(wp.id, me)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pot_comments_count(p_pot_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM meal_pots WHERE id = p_pot_id AND group_id IN (SELECT public.app_my_group_ids())
  ) THEN
    RAISE EXCEPTION 'not a member of this pot''s group';
  END IF;

  SELECT count(*) INTO v_count FROM pot_comments WHERE pot_id = p_pot_id;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pot_invite_preview(p_id uuid)
 RETURNS TABLE(title text, date text, slot text, meal_time text, end_time text, menu text, group_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT mp.title, mp.date::text, mp.slot, mp.meal_time::text, mp.end_time::text, mp.menu, g.name AS group_name
  FROM meal_pots mp
  JOIN groups g ON g.id = mp.group_id
  WHERE mp.id = p_id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_pot_photos_count(p_pot_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM meal_pots WHERE id = p_pot_id AND group_id IN (SELECT public.app_my_group_ids())
  ) THEN
    RAISE EXCEPTION 'not a member of this pot''s group';
  END IF;

  SELECT count(*) INTO v_count FROM pot_photos WHERE pot_id = p_pot_id;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_wish_place_comments(p_wish_place_id uuid)
 RETURNS TABLE(id uuid, user_id uuid, nickname text, avatar_url text, content text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE me UUID := public.app_current_user_id();
BEGIN
  IF NOT public.can_view_wish_place(p_wish_place_id, me) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT c.id, c.user_id, u.nickname, u.avatar_url, c.content, c.created_at
    FROM wish_place_comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.wish_place_id = p_wish_place_id
    ORDER BY c.created_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_wish_place_content(p_wish_place_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE me UUID := public.app_current_user_id();
BEGIN
  IF NOT public.can_view_wish_place(p_wish_place_id, me) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT content FROM wish_places WHERE id = p_wish_place_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_wish_place_likes(p_wish_place_id uuid)
 RETURNS TABLE(user_id uuid, nickname text, avatar_url text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE me UUID := public.app_current_user_id();
BEGIN
  IF NOT public.can_view_wish_place(p_wish_place_id, me) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT l.user_id, u.nickname, u.avatar_url, l.created_at
    FROM wish_place_likes l
    JOIN users u ON u.id = l.user_id
    WHERE l.wish_place_id = p_wish_place_id
    ORDER BY l.created_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_group_by_password(p_group_id uuid, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.mark_friends_wish_seen()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO user_nav_state (user_id) VALUES (me)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE user_nav_state SET friends_wish_seen_at = now() WHERE user_id = me;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_moments_seen(p_scope text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL OR p_scope NOT IN ('group', 'public') THEN
    RETURN;
  END IF;

  INSERT INTO user_nav_state (user_id) VALUES (me)
  ON CONFLICT (user_id) DO NOTHING;

  IF p_scope = 'group' THEN
    UPDATE user_nav_state SET moments_group_seen_at = now() WHERE user_id = me;
  ELSE
    UPDATE user_nav_state SET moments_public_seen_at = now() WHERE user_id = me;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_groups(p_query text)
 RETURNS TABLE(id uuid, name text, member_count bigint, owner_nickname text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
  q TEXT := trim(p_query);
BEGIN
  IF me IS NULL OR length(q) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT g.id, g.name, count(gm2.user_id) AS member_count, u.nickname AS owner_nickname
  FROM groups g
  JOIN group_search_settings s ON s.group_id = g.id AND s.allow_search = true
  LEFT JOIN group_members gm2 ON gm2.group_id = g.id
  LEFT JOIN users u ON u.id = g.created_by
  WHERE g.name ILIKE '%' || q || '%'
    AND NOT EXISTS (
      SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = me
    )
  GROUP BY g.id, g.name, u.nickname
  ORDER BY g.name
  LIMIT 20;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_users(p_query text)
 RETURNS TABLE(id uuid, nickname text, avatar_url text, relation text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
  q TEXT := trim(p_query);
BEGIN
  IF me IS NULL OR length(q) < 2 THEN
    RETURN;
  END IF;

  IF q LIKE '%@%' THEN
    RETURN QUERY
    SELECT u.id, u.nickname, u.avatar_url,
      COALESCE(
        CASE
          WHEN fr.status = 'accepted' THEN 'friends'
          WHEN fr.status = 'pending' AND fr.from_user_id = me THEN 'pending_sent'
          WHEN fr.status = 'pending' AND fr.to_user_id = me THEN 'pending_received'
        END, 'none')
    FROM users u
    LEFT JOIN friend_requests fr
      ON (fr.from_user_id = me AND fr.to_user_id = u.id)
      OR (fr.from_user_id = u.id AND fr.to_user_id = me)
    WHERE lower(u.email) = lower(q)
      AND u.id != me AND u.is_guest = false AND u.is_discoverable = true
    LIMIT 1;
  ELSE
    RETURN QUERY
    SELECT u.id, u.nickname, u.avatar_url,
      COALESCE(
        CASE
          WHEN fr.status = 'accepted' THEN 'friends'
          WHEN fr.status = 'pending' AND fr.from_user_id = me THEN 'pending_sent'
          WHEN fr.status = 'pending' AND fr.to_user_id = me THEN 'pending_received'
        END, 'none')
    FROM users u
    LEFT JOIN friend_requests fr
      ON (fr.from_user_id = me AND fr.to_user_id = u.id)
      OR (fr.from_user_id = u.id AND fr.to_user_id = me)
    WHERE u.nickname ILIKE '%' || q || '%'
      AND u.id != me AND u.is_guest = false AND u.is_discoverable = true
    ORDER BY u.nickname
    LIMIT 20;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_auto_friend_groupmates(p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION '로그인이 필요해요';
  END IF;

  UPDATE users SET auto_friend_groupmates = p_enabled WHERE id = me;

  IF p_enabled THEN
    PERFORM public.sync_auto_friend_groupmates(me);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_group_allow_search(p_group_id uuid, p_allow boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.set_group_password(p_group_id uuid, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.set_pot_moment_scope(p_pot_id uuid, p_scope text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_scope NOT IN ('participants', 'group', 'public') THEN
    RAISE EXCEPTION 'invalid moment_scope: %', p_scope;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pot_members WHERE pot_id = p_pot_id AND user_id = public.app_current_user_id()
  ) THEN
    RAISE EXCEPTION 'not a participant of this pot';
  END IF;
  UPDATE meal_pots SET moment_scope = p_scope WHERE id = p_pot_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_auto_friend_groupmates(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me_enabled BOOLEAN;
BEGIN
  SELECT auto_friend_groupmates INTO me_enabled FROM users WHERE id = p_user_id;
  IF NOT COALESCE(me_enabled, false) THEN
    RETURN;
  END IF;

  INSERT INTO friend_requests (from_user_id, to_user_id, status, responded_at)
  SELECT p_user_id, other.id, 'accepted', now()
  FROM (
    SELECT DISTINCT u2.id
    FROM group_members gm1
    JOIN group_members gm2 ON gm2.group_id = gm1.group_id AND gm2.user_id != p_user_id
    JOIN users u2 ON u2.id = gm2.user_id
    WHERE gm1.user_id = p_user_id
      AND u2.auto_friend_groupmates = true
      AND u2.is_guest = false
  ) other
  WHERE NOT EXISTS (
    SELECT 1 FROM friend_requests fr
    WHERE (fr.from_user_id = p_user_id AND fr.to_user_id = other.id)
       OR (fr.from_user_id = other.id AND fr.to_user_id = p_user_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_group_members_auto_friend()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.sync_auto_friend_groupmates(NEW.user_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.wish_place_owner(p_wish_place_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT user_id FROM wish_places WHERE id = p_wish_place_id
$function$;

-- ============================================================
-- RLS 활성화
-- ============================================================

ALTER TABLE public.daily_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_share_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_default_pot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_join_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_search_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_share_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lunch_reminder_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_pots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pot_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pot_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pot_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pot_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_nav_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_term_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wish_place_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wish_place_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wish_place_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wish_place_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wish_places ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS 정책
-- ============================================================

CREATE POLICY "anon all" ON public.daily_status
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "daily_tips_select_all" ON public.daily_tips
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "daily_tips_write_authenticated" ON public.daily_tips
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "fcm_tokens_delete_own" ON public.fcm_tokens
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "fcm_tokens_insert_own" ON public.fcm_tokens
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = app_current_user_id()));

CREATE POLICY "fcm_tokens_select_own" ON public.fcm_tokens
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "fcm_tokens_update_own" ON public.fcm_tokens
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = app_current_user_id()))
  WITH CHECK ((user_id = app_current_user_id()));

CREATE POLICY "feedback_insert_own" ON public.feedback
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = app_current_user_id()));

CREATE POLICY "feedback_select_own_or_admin" ON public.feedback
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((user_id = app_current_user_id()) OR app_is_admin()));

CREATE POLICY "feedback_update_admin" ON public.feedback
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());

CREATE POLICY "friend_requests_delete_participant" ON public.friend_requests
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((from_user_id = app_current_user_id()) OR (to_user_id = app_current_user_id())));

CREATE POLICY "friend_requests_insert_own" ON public.friend_requests
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((from_user_id = app_current_user_id()));

CREATE POLICY "friend_requests_select_own" ON public.friend_requests
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((from_user_id = app_current_user_id()) OR (to_user_id = app_current_user_id())));

CREATE POLICY "friend_requests_update_participant" ON public.friend_requests
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((from_user_id = app_current_user_id()) OR (to_user_id = app_current_user_id())))
  WITH CHECK (((from_user_id = app_current_user_id()) OR (to_user_id = app_current_user_id())));

CREATE POLICY "friend_share_settings_write_own" ON public.friend_share_settings
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((user_id = app_current_user_id()))
  WITH CHECK ((user_id = app_current_user_id()));

CREATE POLICY "allow all" ON public.group_default_pot_configs
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon all" ON public.group_members
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "group_share_settings_select_member" ON public.group_share_settings
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((group_id IN ( SELECT group_members.group_id
   FROM group_members
  WHERE (group_members.user_id = app_current_user_id()))));

CREATE POLICY "group_share_settings_write_own" ON public.group_share_settings
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((user_id = app_current_user_id()))
  WITH CHECK ((user_id = app_current_user_id()));

CREATE POLICY "그룹원 설정 읽기" ON public.group_share_settings
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((group_id IN ( SELECT gm.group_id
   FROM (group_members gm
     JOIN users u ON ((u.id = gm.user_id)))
  WHERE (u.auth_id = auth.uid()))));

CREATE POLICY "본인 설정 쓰기" ON public.group_share_settings
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((auth.uid() = ( SELECT users.auth_id
   FROM users
  WHERE (users.id = group_share_settings.user_id))));

CREATE POLICY "allow_invite_code_lookup" ON public.groups
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((invite_code IS NOT NULL));

CREATE POLICY "anon all" ON public.groups
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "groups_select_via_pot" ON public.groups
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((id IN ( SELECT meal_pots.group_id
   FROM meal_pots
  WHERE (meal_pots.id IN ( SELECT app_my_pot_ids() AS app_my_pot_ids)))));

CREATE POLICY "groups_select_via_public_pot" ON public.groups
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((id IN ( SELECT meal_pots.group_id
   FROM meal_pots
  WHERE (meal_pots.moment_scope = 'public'::text))));

CREATE POLICY "holidays_admin" ON public.holidays
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());

CREATE POLICY "lunch_reminder_config_admin" ON public.lunch_reminder_config
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());

CREATE POLICY "anon all" ON public.meal_pots
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "meal_pots_insert_no_group" ON public.meal_pots
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((group_id IS NULL));

CREATE POLICY "meal_pots_select_authenticated" ON public.meal_pots
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "notifications_insert_admin" ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (app_is_admin());

CREATE POLICY "notifications_insert_friendreq" ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((friend_request_id IN ( SELECT friend_requests.id
   FROM friend_requests
  WHERE ((friend_requests.from_user_id = app_current_user_id()) OR (friend_requests.to_user_id = app_current_user_id())))));

CREATE POLICY "notifications_insert_invitation" ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((invitation_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM pot_invitations pi
  WHERE ((pi.id = notifications.invitation_id) AND (pi.from_user_id = app_current_user_id()) AND (pi.to_user_id = notifications.user_id))))));

CREATE POLICY "notifications_insert_invitation_decline" ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((invitation_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM pot_invitations pi
  WHERE ((pi.id = notifications.invitation_id) AND (pi.to_user_id = app_current_user_id()) AND (pi.from_user_id = notifications.user_id))))));

CREATE POLICY "notifications_insert_sharedgroup" ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((group_id IN ( SELECT app_my_group_ids() AS app_my_group_ids)));

CREATE POLICY "notifications_insert_sharedpot" ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((pot_id IN ( SELECT app_my_pot_ids() AS app_my_pot_ids)));

CREATE POLICY "notifications_insert_wishcomment" ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((wish_place_comment_id IN ( SELECT wish_place_comments.id
   FROM wish_place_comments
  WHERE (wish_place_comments.user_id = app_current_user_id()))));

CREATE POLICY "notifications_insert_wishlike" ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((wish_place_like_id IN ( SELECT wish_place_likes.id
   FROM wish_place_likes
  WHERE (wish_place_likes.user_id = app_current_user_id()))));

CREATE POLICY "notifications_insert_wishmention" ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((wish_place_mention_comment_id IN ( SELECT wish_place_comments.id
   FROM wish_place_comments
  WHERE (wish_place_comments.user_id = app_current_user_id()))));

CREATE POLICY "notifications_insert_wishpropose" ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((wish_place_proposal_id IN ( SELECT wish_place_proposals.id
   FROM wish_place_proposals
  WHERE (wish_place_proposals.from_user_id = app_current_user_id()))));

CREATE POLICY "notifications_select_own" ON public.notifications
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "notifications_update_own" ON public.notifications
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = app_current_user_id()))
  WITH CHECK ((user_id = app_current_user_id()));

CREATE POLICY "pot_comments_delete_own" ON public.pot_comments
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "pot_comments_insert_own" ON public.pot_comments
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = app_current_user_id()) AND (pot_id IN ( SELECT app_my_pot_ids() AS app_my_pot_ids))));

CREATE POLICY "pot_comments_select_member" ON public.pot_comments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((pot_id IN ( SELECT app_my_pot_ids() AS app_my_pot_ids)) OR (pot_id IN ( SELECT meal_pots.id
   FROM meal_pots
  WHERE ((meal_pots.moment_scope = 'group'::text) AND (meal_pots.group_id IN ( SELECT app_my_group_ids() AS app_my_group_ids))))) OR (pot_id IN ( SELECT meal_pots.id
   FROM meal_pots
  WHERE (meal_pots.moment_scope = 'public'::text)))));

CREATE POLICY "pot_invitations_insert_friend" ON public.pot_invitations
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((from_user_id = app_current_user_id()) AND (group_id IS NULL) AND (EXISTS ( SELECT 1
   FROM friend_requests fr
  WHERE ((fr.status = 'accepted'::text) AND (((fr.from_user_id = pot_invitations.from_user_id) AND (fr.to_user_id = pot_invitations.to_user_id)) OR ((fr.from_user_id = pot_invitations.to_user_id) AND (fr.to_user_id = pot_invitations.from_user_id))))))));

CREATE POLICY "pot_invitations_insert_sharedgroup" ON public.pot_invitations
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((from_user_id = app_current_user_id()) AND (EXISTS ( SELECT 1
   FROM group_members gm
  WHERE ((gm.group_id = pot_invitations.group_id) AND (gm.user_id = pot_invitations.from_user_id)))) AND (EXISTS ( SELECT 1
   FROM group_members gm
  WHERE ((gm.group_id = pot_invitations.group_id) AND (gm.user_id = pot_invitations.to_user_id))))));

CREATE POLICY "pot_invitations_select_party" ON public.pot_invitations
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((from_user_id = app_current_user_id()) OR (to_user_id = app_current_user_id())));

CREATE POLICY "pot_invitations_update_party" ON public.pot_invitations
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((from_user_id = app_current_user_id()) OR (to_user_id = app_current_user_id())))
  WITH CHECK (((from_user_id = app_current_user_id()) OR (to_user_id = app_current_user_id())));

CREATE POLICY "anon all" ON public.pot_members
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "pot_members_delete_own" ON public.pot_members
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "pot_members_insert_own" ON public.pot_members
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = app_current_user_id()));

CREATE POLICY "pot_members_select_admin" ON public.pot_members
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (app_is_admin());

CREATE POLICY "pot_members_select_sharedpot" ON public.pot_members
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((pot_id IN ( SELECT app_my_pot_ids() AS app_my_pot_ids)));

CREATE POLICY "pot_photos_delete_own" ON public.pot_photos
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "pot_photos_insert_own" ON public.pot_photos
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = app_current_user_id()) AND (pot_id IN ( SELECT app_my_pot_ids() AS app_my_pot_ids))));

CREATE POLICY "pot_photos_select_member" ON public.pot_photos
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((pot_id IN ( SELECT app_my_pot_ids() AS app_my_pot_ids)) OR (pot_id IN ( SELECT meal_pots.id
   FROM meal_pots
  WHERE ((meal_pots.moment_scope = 'group'::text) AND (meal_pots.group_id IN ( SELECT app_my_group_ids() AS app_my_group_ids))))) OR (pot_id IN ( SELECT meal_pots.id
   FROM meal_pots
  WHERE (meal_pots.moment_scope = 'public'::text)))));

CREATE POLICY "push_subscriptions_delete_own" ON public.push_subscriptions
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "push_subscriptions_insert_own" ON public.push_subscriptions
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = app_current_user_id()));

CREATE POLICY "push_subscriptions_select_own" ON public.push_subscriptions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "push_subscriptions_update_own" ON public.push_subscriptions
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = app_current_user_id()))
  WITH CHECK ((user_id = app_current_user_id()));

CREATE POLICY "reports_insert_own" ON public.reports
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((reporter_id = app_current_user_id()));

CREATE POLICY "reports_select_own_or_admin" ON public.reports
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((reporter_id = app_current_user_id()) OR app_is_admin()));

CREATE POLICY "reports_update_admin" ON public.reports
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());

CREATE POLICY "terms_select_all" ON public.terms
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "terms_write_admin" ON public.terms
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());

CREATE POLICY "user_nav_state_select_own" ON public.user_nav_state
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "agreements_insert_own" ON public.user_term_agreements
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id IN ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid()))));

CREATE POLICY "agreements_select_admin" ON public.user_term_agreements
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (app_is_admin());

CREATE POLICY "agreements_select_own" ON public.user_term_agreements
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id IN ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid()))));

CREATE POLICY "agreements_update_own" ON public.user_term_agreements
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id IN ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid()))))
  WITH CHECK ((user_id IN ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid()))));

CREATE POLICY "anon all" ON public.users
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "users can insert own row" ON public.users
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((auth_id = auth.uid()));

CREATE POLICY "users can read own row" ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth_id = auth.uid()));

CREATE POLICY "users can update own row" ON public.users
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((auth_id = auth.uid()));

CREATE POLICY "users_select_sharedpot" ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((auth_id = auth.uid()) OR (id IN ( SELECT pot_members.user_id
   FROM pot_members
  WHERE (pot_members.pot_id IN ( SELECT app_my_pot_ids() AS app_my_pot_ids))))));

CREATE POLICY "wish_place_comments_delete_own_or_owner" ON public.wish_place_comments
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((user_id = app_current_user_id()) OR (wish_place_id IN ( SELECT wish_places.id
   FROM wish_places
  WHERE (wish_places.user_id = app_current_user_id())))));

CREATE POLICY "wish_place_comments_insert_related" ON public.wish_place_comments
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = app_current_user_id()) AND can_view_wish_place(wish_place_id, app_current_user_id())));

CREATE POLICY "wish_place_comments_select_related" ON public.wish_place_comments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (can_view_wish_place(wish_place_id, app_current_user_id()));

CREATE POLICY "wish_place_likes_delete_own" ON public.wish_place_likes
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "wish_place_likes_insert_own" ON public.wish_place_likes
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = app_current_user_id()) AND can_view_wish_place(wish_place_id, app_current_user_id()) AND (user_id <> wish_place_owner(wish_place_id))));

CREATE POLICY "wish_place_likes_select_related" ON public.wish_place_likes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (can_view_wish_place(wish_place_id, app_current_user_id()));

CREATE POLICY "wish_place_proposals_delete_related" ON public.wish_place_proposals
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((from_user_id = app_current_user_id()) OR (to_user_id = app_current_user_id())));

CREATE POLICY "wish_place_proposals_insert_related" ON public.wish_place_proposals
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((from_user_id = app_current_user_id()) AND (to_user_id = wish_place_owner(wish_place_id)) AND can_view_wish_place(wish_place_id, app_current_user_id())));

CREATE POLICY "wish_place_proposals_select_related" ON public.wish_place_proposals
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((from_user_id = app_current_user_id()) OR (to_user_id = app_current_user_id())));

CREATE POLICY "wish_place_shares_delete_own" ON public.wish_place_shares
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((wish_place_id IN ( SELECT wish_places.id
   FROM wish_places
  WHERE (wish_places.user_id = app_current_user_id()))));

CREATE POLICY "wish_place_shares_insert_own" ON public.wish_place_shares
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((wish_place_id IN ( SELECT wish_places.id
   FROM wish_places
  WHERE (wish_places.user_id = app_current_user_id()))));

CREATE POLICY "wish_place_shares_select_own" ON public.wish_place_shares
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((wish_place_id IN ( SELECT wish_places.id
   FROM wish_places
  WHERE (wish_places.user_id = app_current_user_id()))));

CREATE POLICY "wish_places_delete_own" ON public.wish_places
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "wish_places_insert_own" ON public.wish_places
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = app_current_user_id()));

CREATE POLICY "wish_places_select_own" ON public.wish_places
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "wish_places_update_own" ON public.wish_places
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = app_current_user_id()));

CREATE POLICY "avatars_own_delete" ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "avatars_own_update" ON storage.objects
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "avatars_own_upload" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "avatars_public_read" ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((bucket_id = 'avatars'::text));

CREATE POLICY "daily_tips_storage_authenticated_delete" ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((bucket_id = 'daily-tips'::text));

CREATE POLICY "daily_tips_storage_authenticated_write" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((bucket_id = 'daily-tips'::text));

CREATE POLICY "daily_tips_storage_public_read" ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((bucket_id = 'daily-tips'::text));

CREATE POLICY "pot_photos_storage_own_delete" ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'pot-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "pot_photos_storage_own_upload" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'pot-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "pot_photos_storage_public_read" ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((bucket_id = 'pot-photos'::text));

-- ============================================================
-- 트리거
-- ============================================================

CREATE TRIGGER group_members_auto_friend AFTER INSERT ON public.group_members FOR EACH ROW EXECUTE FUNCTION trg_group_members_auto_friend();

-- ============================================================
-- Storage 버킷
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('avatars', 'avatars', true, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('pot-photos', 'pot-photos', true, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('daily-tips', 'daily-tips', true, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Realtime publication
-- ============================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_status;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_pots;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pot_members;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_share_settings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_default_pot_configs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
