# 같이 먹자 — AGENTS.md

## 서비스 개요

**"같이 먹자"** 는 혼밥은 싫고 무거운 약속도 싫을 때, 이미 아는 사람들(팀/부서/친구 그룹) 사이에서 오늘 밥 가능 상태를 공유하고 가볍게 밥팟을 만드는 서비스다.

핵심 포지션: 새로운 사람을 매칭하는 앱이 아니라, 기존 지인 사이에서 **눈치 비용 없이** 밥 가능 상태를 보여주는 서비스.

경쟁자는 밥친구 앱이 아니라 **카톡 단톡방, 사내 메신저, "약속 있어?"라는 말 자체**다.

---

## 핵심 원칙

1. 첫 화면에서 10초 안에 행동 완료 — "오늘 점심 가능" 누르기
2. 설치 없이 링크 하나로 진입 가능
3. 채팅 없음 — 모든 소통은 밥팟 + 카톡/링크 공유로

---

## 기술 스택

| 역할 | 선택 |
|------|------|
| 프레임워크 | React (Vite) |
| DB + Auth | Supabase |
| 호스팅 | Vercel |
| Android 앱 | Capacitor |
| AI 코딩 툴 | Claude Code |

- React(Vite) + Supabase + Vercel + Capacitor 조합으로 간다
- Next.js 아님. Vite 기반 React SPA
- Capacitor는 Android 전용. iOS는 나중에

---

## 화면 구조 (5개)

```
① 진입/온보딩   → 그룹 초대 링크 or 밥팟 직접 입장
② 오늘 메인     → 상태 선택 + 오늘 현황판 (핵심 화면)
③ 밥팟 만들기   → 시간/메뉴/인원/공개범위
④ 밥팟 상세     → 참여/취소 + 링크 공유
⑤ 그룹 설정     → 멤버 목록 + 초대 링크
```

### ① 진입/온보딩
- 회원가입 없음. 닉네임만 입력 후 로컬 저장
- 그룹 초대 링크로 진입 → 닉네임 입력 → 오늘 메인
- 밥팟 링크로 진입 → 닉네임 입력 → 밥팟 상세 (그룹 없이도 참여 가능)

### ② 오늘 메인 (가장 중요)
- 앱 켜면 바로 이 화면
- 상태 선택: [점심 가능] [저녁 가능] [커피만] [패스]
- 그룹 멤버들의 오늘 상태 현황판
- 오늘 열린 밥팟 목록
- [+ 밥팟 만들기] CTA
- 상태는 매일 자정 자동 초기화

### ③ 밥팟 만들기
- 입력 4개만: 시간 / 메뉴 / 최대 인원 / 공개 범위(그룹만 or 전체 공개)
- "전체 공개"로 열면 그룹 없는 사람도 링크로 참여 가능

### ④ 밥팟 상세
- 참여 인원 현황 (점 UI)
- 참여하기 / 취소 버튼
- 링크 복사 / 카톡 공유
- 카톡 공유 미리보기: "🍚 12:10 김치찌개팟 · 2/4명 · 같이먹자 → 링크"

### ⑤ 그룹 설정
- 그룹 이름
- 초대 링크 복사
- 멤버 목록

---

## DB 스키마 (Supabase / PostgreSQL)

```sql
-- 유저
create table users (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  device_token text,
  created_at timestamptz default now()
);

-- 그룹
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  is_public boolean default false,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- 그룹 멤버
create table group_members (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  primary key (group_id, user_id),
  joined_at timestamptz default now()
);

-- 오늘 상태 (자정 초기화)
create table daily_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade,
  date date not null default current_date,
  status text check (status in ('점심', '저녁', '커피', '패스')) not null,
  created_at timestamptz default now(),
  unique (user_id, group_id, date)
);

-- 밥팟
create table meal_pots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade, -- nullable: 공개 밥팟
  date date not null default current_date,
  meal_time time not null,
  title text not null,
  max_people int not null default 4,
  is_public boolean default false,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- 밥팟 참여
create table pot_members (
  pot_id uuid references meal_pots(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  primary key (pot_id, user_id),
  joined_at timestamptz default now()
);
```

---

## MVP에서 절대 안 넣을 것

- 채팅 기능
- 지도 / 맛집 연동
- 정산
- 리뷰 / 평점
- 푸시 알림 (카톡 공유로 대체)
- 소셜 로그인 (초기엔 닉네임만)
- iOS 앱

---

## 2주 배포 목표 일정

| 기간 | 목표 |
|------|------|
| 1~2일 | Supabase 세팅, Vite+React 프로젝트 구조 |
| 3~4일 | 진입/온보딩 화면, 닉네임 저장, 그룹 입장 |
| 5~7일 | 오늘 메인 화면 + 상태 선택 |
| 8~10일 | 밥팟 만들기 + 참여 + 공유 |
| 11~12일 | 밥팟 링크 직접 진입 (공개팟) |
| 13~14일 | 모바일 UX 다듬기 + Vercel 배포 + 지인 테스트 |

---

## UX 패턴 규칙

### 상세/편집 페이지 네비게이션
iOS HIG 표준에 따라 상태에 따라 헤더 버튼을 다르게 구성한다.

| 상태 | 헤더 좌측 | 헤더 우측 |
|------|-----------|-----------|
| 보기 모드 | `←` 뒤로가기 | 보조 액션 (예: 향후 수정) |
| 편집 모드 | `취소` (변경 버리기) | `완료` (저장) |

- 편집 모드 진입 시 뒤로가기가 `취소`로 교체됨
- 하단 별도 확인 바 사용 안 함

---

## 코딩 컨벤션 및 주의사항

- 컴포넌트는 기능 단위로 분리 (화면당 1개 메인 컴포넌트)
- Supabase 클라이언트는 `src/lib/supabase.js` 에서 싱글톤으로 관리
- 환경변수는 `.env` 파일로 관리 (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- 모바일 우선 (max-width: 430px 기준) UI
- 닉네임/유저 정보는 `localStorage`에 저장
- 날짜 처리는 항상 한국 시간(KST) 기준

---

## 서비스 카피

메인: **오늘 같이 먹을 사람, 묻지 말고 확인하기**

서브: 혼밥은 싫고, 약속은 귀찮을 때.

앱 설명: 회사, 학교, 친구 그룹에서 오늘 점심·저녁·커피 가능 상태를 공유하고, 부담 없이 밥팟을 만드는 서비스.
