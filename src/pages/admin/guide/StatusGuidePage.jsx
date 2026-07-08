import { useState } from 'react'
import { SLOT_STATUS_OPTIONS, SLOT_KEYS } from '../../../mock/data'

// ── 데이터 정의 ── 규칙 변경 시 이 파일을 먼저 수정하고 서비스에 반영 ──

const SLOT_DETAILS = [
  { key: '아침',     time: '06:00–09:30', desc: '아침 식사' },
  { key: '오전간식', time: '09:30–11:30', desc: '오전 간식·커피' },
  { key: '점심',     time: '11:30–14:00', desc: '점심 식사 (가장 활성화된 슬롯)' },
  { key: '오후간식', time: '14:00–17:00', desc: '오후 간식·커피' },
  { key: '저녁',     time: '17:00–21:00', desc: '저녁 식사' },
  { key: '야식',     time: '21:00–02:00', desc: '야식·늦은 모임' },
]

const STATUS_DETAILS = {
  open: {
    description: '해당 슬롯에 아직 약속이 없고, 같이 먹을 의향이 있는 상태.',
    rules: [
      '슬롯을 처음 열면 기본값으로 설정된다.',
      '밥팟에 참여하면 자동으로 "참여중"으로 전환된다.',
      '시간·메뉴를 함께 입력하면 구체적인 의향을 표시할 수 있다.',
    ],
    autoSet: false,
  },
  skip: {
    description: '해당 슬롯에 관심이 없거나, 먹지 않을 예정인 상태.',
    rules: [
      '그룹 피드에서는 이름만 표시되고 세부 정보는 노출되지 않는다.',
      '밥팟 참여 요청이 들어와도 우선순위가 낮게 처리된다.',
    ],
    autoSet: false,
  },
  closed: {
    description: '이미 외부 약속이 있어 같이 먹기 어려운 상태.',
    rules: [
      '그룹 피드에서 잠금 아이콘으로 표시된다.',
      '밥팟을 개설하거나 참여할 수 없다.',
      '메뉴 입력란에 약속 이름(예: "가족 약속")을 적을 수 있다.',
    ],
    autoSet: false,
  },
  참여중: {
    description: '해당 슬롯에서 활성 밥팟에 참여 중인 상태.',
    rules: [
      '사용자가 직접 선택할 수 없으며, 밥팟 참여 시 자동으로 설정된다.',
      '밥팟에서 나가면 "약속 없음(open)"으로 자동 복원된다.',
      '같은 슬롯에 중복으로 밥팟을 개설하거나 참여할 수 없다.',
      '밥팟의 종료 시간(end_time)이 지나면 자동으로 "참여완료"로 전환된다.',
    ],
    autoSet: true,
  },
  참여완료: {
    description: '참여했던 밥팟의 종료 시간이 지나 마무리된 상태.',
    rules: [
      '사용자가 직접 선택할 수 없으며, 참여 중이던 밥팟의 end_time이 지나면 자동으로 설정된다.',
      '별도로 저장되지 않고, 팟 시간 경과 여부에 따라 매번 파생되어 표시된다.',
    ],
    autoSet: true,
  },
}

const TABS = [
  { key: 'slots',      label: '식사 슬롯' },
  { key: 'status',     label: '상태 유형' },
  { key: 'transition', label: '상태 전환' },
  { key: 'group',      label: '그룹' },
  { key: 'visibility', label: '가시성' },
  { key: 'schema',     label: 'DB 스키마' },
]

// ── 메인 컴포넌트 ──

export default function StatusGuidePage() {
  const [activeTab, setActiveTab] = useState('slots')

  return (
    <div style={s.page}>
      <header style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>사용자 상태 규칙</h1>
          <p style={s.pageDesc}>
            서비스에서 사용하는 상태 유형, 슬롯 정의, 전환 규칙을 정의합니다.
            규칙 변경 시 <strong>이 페이지를 먼저 수정</strong>한 뒤 서비스 코드에 반영하세요.
          </p>
        </div>
        <div style={s.sourceBadge}>
          <span style={s.sourceBadgeLabel}>정의 파일</span>
          <code style={s.sourceBadgeCode}>src/mock/data.js</code>
        </div>
      </header>

      {/* 탭 바 */}
      <div style={s.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            style={{ ...s.tabBtn, ...(activeTab === tab.key ? s.tabBtnActive : {}) }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div style={s.tabContent}>
        {activeTab === 'slots'      && <TabSlots />}
        {activeTab === 'status'     && <TabStatus />}
        {activeTab === 'transition' && <TabTransition />}
        {activeTab === 'group'      && <TabGroup />}
        {activeTab === 'visibility' && <TabVisibility />}
        {activeTab === 'schema'     && <TabSchema />}
      </div>
    </div>
  )
}

// ── 탭: 식사 슬롯 ──

function TabSlots() {
  return (
    <div>
      <p style={s.tabDesc}>
        하루 6개의 슬롯이 고정 정의되어 있으며, 사용자는 슬롯별로 독립적인 상태를 가집니다.
        슬롯 순서는 <code style={s.inlineCode}>SLOT_KEYS</code> 배열로 관리합니다.
      </p>
      <table style={s.table}>
        <thead>
          <tr>
            <Th>순서</Th>
            <Th>슬롯 키</Th>
            <Th>권장 시간대</Th>
            <Th>설명</Th>
          </tr>
        </thead>
        <tbody>
          {SLOT_DETAILS.map((slot, i) => (
            <tr key={slot.key} style={i % 2 === 0 ? s.trEven : {}}>
              <Td style={{ textAlign: 'center', color: '#999' }}>{SLOT_KEYS.indexOf(slot.key)}</Td>
              <Td><code style={s.inlineCode}>{slot.key}</code></Td>
              <Td style={{ color: '#666' }}>{slot.time}</Td>
              <Td>{slot.desc}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 탭: 상태 유형 ──

const UNSET_DETAIL = {
  key: null,
  label: '미설정',
  emoji: '⬜',
  color: '#BDBDBD',
  selectable: false,
  description: '해당 슬롯에 대해 사용자가 아무 상태도 등록하지 않은 초기 상태.',
  rules: [
    'daily_status 테이블에 해당 (user_id, date, slot) 레코드가 존재하지 않는다.',
    '그룹 피드에서는 "미설정" 텍스트로 표시된다.',
    '슬롯을 처음 열거나 상태를 삭제하면 이 상태가 된다.',
  ],
  autoSet: false,
}

function TabStatus() {
  return (
    <div>
      <p style={s.tabDesc}>
        사용자는 각 슬롯마다 아래 상태 중 하나를 가집니다.
        상태는 그룹 단위가 아닌 <strong>유저 단위</strong>로 저장되며, 모든 그룹에 동일하게 표시됩니다.
      </p>
      <div style={s.statusGrid}>
        {/* 미설정: DB 레코드 없음 (null) */}
        <StatusCard
          opt={{ key: null, label: UNSET_DETAIL.label, emoji: UNSET_DETAIL.emoji, color: UNSET_DETAIL.color, selectable: false }}
          detail={UNSET_DETAIL}
          keyLabel="null"
        />
        {SLOT_STATUS_OPTIONS.map(opt => (
          <StatusCard key={opt.key} opt={opt} detail={STATUS_DETAILS[opt.key]} keyLabel={opt.key} />
        ))}
      </div>
    </div>
  )
}

function StatusCard({ opt, detail, keyLabel }) {
  return (
    <div style={s.statusCard}>
      <div style={s.statusCardTop}>
        <div style={s.statusBadgeWrap}>
          <span style={{
            ...s.statusBadge,
            background: opt.color + '22',
            color: opt.color,
            border: `1px solid ${opt.color}55`,
          }}>
            {opt.emoji} {opt.label}
          </span>
          {detail.autoSet && <span style={s.autoTag}>자동 설정</span>}
        </div>
        <code style={s.keyTag}>{keyLabel}</code>
      </div>
      <p style={s.statusDesc}>{detail.description}</p>
      <div style={s.ruleList}>
        {detail.rules.map((r, i) => (
          <div key={i} style={s.ruleItem}>
            <span style={s.ruleDot}>•</span>
            <span>{r}</span>
          </div>
        ))}
      </div>
      <div style={s.statusMeta}>
        <MetaRow label="표시 색상" value={opt.color} swatch={opt.color} />
        <MetaRow
          label="사용자 선택"
          value={opt.selectable ? '가능' : '불가 (자동)'}
          valueStyle={{ color: opt.selectable ? '#4CAF50' : '#FF6B35' }}
        />
      </div>
    </div>
  )
}

// ── 탭: 상태 전환 ──

function TabTransition() {
  return (
    <div>
      <p style={s.tabDesc}>
        상태 전환은 다음 조건에 따라 자동 또는 수동으로 이루어집니다.
      </p>
      <div style={s.transitionGrid}>
        <TransitionCard
          from="open / skip / closed"
          to="참여중"
          trigger="밥팟 참여"
          direction="auto"
          note="사용자가 밥팟에 참여하면 해당 슬롯 상태가 자동으로 '참여중'으로 변경된다."
        />
        <TransitionCard
          from="참여중"
          to="open"
          trigger="밥팟 나가기"
          direction="auto"
          note="밥팟에서 나가면 상태가 '약속 없음(open)'으로 자동 복원된다."
        />
        <TransitionCard
          from="참여중"
          to="참여완료"
          trigger="밥팟 종료 시간(end_time) 경과"
          direction="auto"
          note="참여 중이던 밥팟의 종료 시간이 지나면 자동으로 '참여완료'로 표시된다."
        />
        <TransitionCard
          from="(모든 상태)"
          to="open / skip / closed"
          trigger="사용자 직접 선택"
          direction="manual"
          note="'참여중'/'참여완료' 상태는 사용자가 직접 선택할 수 없다. 다른 세 가지 상태는 언제든 수동 변경 가능."
        />
      </div>
    </div>
  )
}

// ── 탭: 그룹 ──

function TabGroup() {
  return (
    <div>
      <p style={s.tabDesc}>
        그룹은 사용자가 상태를 공유하는 단위입니다. 한 사용자는 여러 그룹에 동시에 속할 수 있으며,
        상태는 그룹과 무관하게 유저 단위로 저장되고 모든 그룹에 동일하게 표시됩니다.
      </p>

      <div style={s.groupSectionTitle}>구조 규칙</div>
      <RuleBlock
        icon="🏷️"
        title="그룹 식별"
        desc="각 그룹은 고유한 UUID(id)와 초대 코드(invite_code)를 가진다. 초대 코드는 6자리 대문자 영숫자로 자동 생성된다."
        field="groups.invite_code"
      />
      <RuleBlock
        icon="👑"
        title="그룹 생성자"
        desc="그룹을 만든 사용자(created_by)는 자동으로 멤버로 등록된다. 생성자 권한과 일반 멤버 권한의 구분은 현재 없다."
        field="groups.created_by"
      />
      <RuleBlock
        icon="🔗"
        title="멤버십"
        desc="그룹 가입은 초대 코드를 통해서만 가능하다. 탈퇴는 언제든 가능하며, 탈퇴해도 해당 사용자의 daily_status 기록은 삭제되지 않는다."
        field="group_members"
      />

      <div style={{ ...s.groupSectionTitle, marginTop: 24 }}>상태와 그룹의 관계</div>
      <RuleBlock
        icon="🔄"
        title="상태 공유 범위"
        desc="사용자의 슬롯 상태는 그룹 단위가 아닌 유저 단위로 저장된다. A 그룹에서 '점심' 상태를 변경하면 B 그룹에서도 동일하게 반영된다."
        field="daily_status.user_id (no group_id)"
      />
      <RuleBlock
        icon="📋"
        title="그룹 피드 조회"
        desc="그룹 피드는 group_members에서 멤버 목록을 가져온 뒤, 해당 user_id들의 daily_status를 날짜 기준으로 조회해 합산한다."
        field="getGroupStatuses(groupId, date)"
      />

      <div style={{ ...s.groupSectionTitle, marginTop: 24 }}>그룹 공유 토글</div>
      <RuleBlock
        icon="🔀"
        title="그룹별 상태 공유 설정"
        desc="사용자는 자신의 상태를 공유할 그룹을 개별적으로 선택할 수 있다. 특정 그룹에 대해 공유를 끄면 해당 그룹 피드에서 그 사용자의 상태가 보이지 않는다."
        field="group_members.is_status_shared"
      />
      <RuleBlock
        icon="⚙️"
        title="토글 범위"
        desc="그룹 공유 토글은 그룹 × 날짜 × 슬롯 단위로 설정된다. 같은 날이라도 슬롯별로 공유 여부를 다르게 지정할 수 있다. 예: A 그룹에는 점심만 공유, B 그룹에는 저녁만 공유."
        field="group_share_settings(group_id, user_id, date, slot)"
      />
      <RuleBlock
        icon="🔗"
        title="is_hidden과의 관계"
        desc="is_hidden(날짜 단위 전체 숨김)과 그룹 공유 토글은 독립적으로 동작한다. is_hidden이 true이면 그룹 공유 토글 설정과 무관하게 모든 그룹에서 숨겨진다. 두 조건 모두 통과해야 상태가 노출된다."
        field="is_hidden=false AND is_status_shared=true → 노출"
      />

      <div style={{ ...s.groupSectionTitle, marginTop: 24 }}>DB 스키마</div>
      <table style={s.table}>
        <thead>
          <tr>
            <Th>테이블</Th>
            <Th>주요 컬럼</Th>
            <Th>설명</Th>
          </tr>
        </thead>
        <tbody>
          {[
            ['groups',              'id, name, invite_code, created_by',              '그룹 정보. invite_code는 Unique.'],
            ['group_members',       'group_id, user_id',                              '그룹-멤버 N:M 매핑. (group_id, user_id) Unique.'],
            ['group_share_settings','group_id, user_id, date, slot, is_shared',       '그룹×날짜×슬롯 단위 공유 설정. is_shared 기본값 true. (group_id, user_id, date, slot) Unique.'],
          ].map(([table, cols, desc], i) => {
            const unimplemented = desc.includes('⚠️ 미구현')
            return (
              <tr key={table} style={{ ...(i % 2 === 0 ? s.trEven : {}), ...(unimplemented ? s.trUnimplemented : {}) }}>
                <Td><code style={s.inlineCode}>{table}</code></Td>
                <Td style={{ color: '#2196F3', fontSize: 12 }}>{cols}</Td>
                <Td style={{ color: '#555' }}>{desc}</Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── 탭: 가시성 ──

function TabVisibility() {
  return (
    <div>
      <RuleBlock
        icon="👁️"
        title="is_hidden 플래그"
        desc="사용자가 특정 날짜의 상태를 숨기면, 해당 날짜의 모든 슬롯 상태가 모든 그룹에서 동시에 숨겨진다. 슬롯 단위 숨김은 지원하지 않는다. '나의 상태' 카드의 공개/숨김 버튼으로 제어하며, 그룹 카드의 슬롯별 공유 토글(group_share_settings)과는 독립적으로 동작한다."
        field="daily_status.is_hidden"
      />
      <RuleBlock
        icon="🔒"
        title="비공개 상태 (closed)"
        desc="'약속있음' 상태는 시간·메뉴 정보를 피드에 노출하지 않는다. 상태 이모지와 라벨만 표시된다."
        field="status = 'closed'"
      />
    </div>
  )
}

// ── 탭: DB 스키마 ──

function TabSchema() {
  return (
    <div>
      <p style={s.tabDesc}>
        상태는 <code style={s.inlineCode}>daily_status</code> 테이블에 저장됩니다.
      </p>
      <table style={s.table}>
        <thead>
          <tr>
            <Th>컬럼</Th>
            <Th>타입</Th>
            <Th>설명</Th>
          </tr>
        </thead>
        <tbody>
          {[
            ['user_id',   'uuid',    '사용자 ID (FK → users)'],
            ['date',      'date',    'KST 기준 YYYY-MM-DD'],
            ['slot',      'text',    'SLOT_KEYS 중 하나'],
            ['status',    'text',    "'open' | 'skip' | 'closed' | '참여중' | '참여완료'"],
            ['meal_time', 'text',    '선택. 식사 예정 시간 (예: "12:10")'],
            ['menu',      'text',    '선택. 메뉴 또는 약속명'],
            ['is_hidden', 'boolean', '해당 날짜 전체 슬롯 숨김 여부'],
          ].map(([col, type, desc], i) => (
            <tr key={col} style={i % 2 === 0 ? s.trEven : {}}>
              <Td><code style={s.inlineCode}>{col}</code></Td>
              <Td style={{ color: '#2196F3', fontSize: 12 }}>{type}</Td>
              <Td style={{ color: '#555' }}>{desc}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ ...s.tabDesc, marginTop: 12 }}>
        <strong>Unique 제약:</strong> <code style={s.inlineCode}>(user_id, date, slot)</code> — 유저·날짜·슬롯 조합은 유일.
      </p>
    </div>
  )
}

// ── 공통 서브 컴포넌트 ──

function MetaRow({ label, value, swatch, valueStyle }) {
  return (
    <div style={s.metaRow}>
      <span style={s.metaLabel}>{label}</span>
      <span style={{ ...s.metaValue, ...valueStyle }}>
        {swatch && <span style={{ ...s.swatch, background: swatch }} />}
        {value}
      </span>
    </div>
  )
}

function TransitionCard({ from, to, trigger, direction, note }) {
  return (
    <div style={s.transitionCard}>
      <div style={s.transitionFlow}>
        <span style={s.transitionState}>{from}</span>
        <span style={s.transitionArrow}>→</span>
        <span style={{ ...s.transitionState, ...s.transitionStateTo }}>{to}</span>
        <span style={{
          ...s.directionTag,
          background: direction === 'auto' ? '#E8F5E9' : '#E3F2FD',
          color: direction === 'auto' ? '#2E7D32' : '#1565C0',
        }}>
          {direction === 'auto' ? '자동' : '수동'}
        </span>
      </div>
      <div style={s.transitionTrigger}>트리거: <strong>{trigger}</strong></div>
      <p style={s.transitionNote}>{note}</p>
    </div>
  )
}

function RuleBlock({ icon, title, desc, field, warning }) {
  return (
    <div style={s.ruleBlock}>
      <div style={s.ruleBlockHeader}>
        <span style={s.ruleBlockIcon}>{icon}</span>
        <span style={s.ruleBlockTitle}>{title}</span>
        <code style={s.fieldTag}>{field}</code>
      </div>
      <p style={s.ruleBlockDesc}>{desc}</p>
      {warning && (
        <div style={s.warningBox}>
          <span style={s.warningIcon}>⚠️</span>
          <span>{warning}</span>
        </div>
      )}
    </div>
  )
}

function Th({ children }) {
  return <th style={s.th}>{children}</th>
}

function Td({ children, style }) {
  return <td style={{ ...s.td, ...style }}>{children}</td>
}

// ── 스타일 ──

const s = {
  page: { maxWidth: 860, margin: '0 auto' },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingBottom: 20,
    borderBottom: '2px solid #E8E8E8',
  },
  pageTitle: { fontSize: 24, fontWeight: 700, color: '#1A1A1A', marginBottom: 8 },
  pageDesc: { fontSize: 14, color: '#666', lineHeight: 1.7 },
  sourceBadge: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  sourceBadgeLabel: { fontSize: 11, color: '#999', fontWeight: 600 },
  sourceBadgeCode: { fontSize: 12, background: '#F0F0F0', padding: '3px 8px', borderRadius: 4, color: '#333' },

  tabBar: {
    display: 'flex',
    gap: 2,
    borderBottom: '2px solid #E8E8E8',
    marginBottom: 28,
  },
  tabBtn: {
    padding: '9px 18px',
    fontSize: 13,
    fontWeight: 500,
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -2,
    color: '#888',
    cursor: 'pointer',
    borderRadius: '6px 6px 0 0',
    transition: 'color 0.15s',
  },
  tabBtnActive: {
    color: '#FF6B35',
    fontWeight: 700,
    borderBottomColor: '#FF6B35',
  },
  tabContent: {},
  tabDesc: { fontSize: 14, color: '#555', marginBottom: 16, lineHeight: 1.7 },

  statusGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 },
  statusCard: {
    background: '#FFFFFF',
    border: '1px solid #E8E8E8',
    borderRadius: 10,
    padding: 18,
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  statusCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusBadgeWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  statusBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: 9999, fontSize: 13, fontWeight: 600 },
  autoTag: { fontSize: 10, fontWeight: 700, background: '#FFF3E0', color: '#E65100', padding: '2px 6px', borderRadius: 4 },
  keyTag: { fontSize: 11, background: '#F0F0F0', color: '#666', padding: '2px 7px', borderRadius: 4 },
  statusDesc: { fontSize: 13, color: '#444', marginBottom: 10, lineHeight: 1.6 },
  ruleList: { marginBottom: 12 },
  ruleItem: { display: 'flex', gap: 6, fontSize: 12, color: '#666', lineHeight: 1.6, marginBottom: 3 },
  ruleDot: { color: '#FF6B35', flexShrink: 0, marginTop: 1 },
  statusMeta: { borderTop: '1px solid #F0F0F0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 },
  metaRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel: { fontSize: 11, color: '#999' },
  metaValue: { fontSize: 12, color: '#333', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 2, display: 'inline-block' },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '9px 12px',
    background: '#F5F5F7',
    color: '#555',
    fontWeight: 600,
    fontSize: 12,
    borderBottom: '1px solid #E0E0E0',
  },
  td: { padding: '9px 12px', borderBottom: '1px solid #F0F0F0', color: '#333', verticalAlign: 'top' },
  trEven: { background: '#FAFAFA' },
  trUnimplemented: { background: '#FFF8E1', opacity: 0.85 },
  inlineCode: { fontSize: 12, background: '#F0F0F0', color: '#333', padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace' },

  transitionGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 },
  transitionCard: { background: '#FFFFFF', border: '1px solid #E8E8E8', borderRadius: 10, padding: 16 },
  transitionFlow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  transitionState: { fontSize: 12, background: '#F5F5F7', color: '#444', padding: '3px 8px', borderRadius: 5, fontWeight: 500 },
  transitionStateTo: { background: '#E8F5E9', color: '#2E7D32' },
  transitionArrow: { color: '#BDBDBD', fontWeight: 700 },
  directionTag: { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, marginLeft: 'auto' },
  transitionTrigger: { fontSize: 12, color: '#555', marginBottom: 6 },
  transitionNote: { fontSize: 11, color: '#888', lineHeight: 1.6 },

  ruleBlock: { background: '#FFFFFF', border: '1px solid #E8E8E8', borderRadius: 10, padding: 16, marginBottom: 12 },
  ruleBlockHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  ruleBlockIcon: { fontSize: 18 },
  ruleBlockTitle: { fontSize: 14, fontWeight: 600, color: '#1A1A1A' },
  fieldTag: { fontSize: 11, background: '#EEF2FF', color: '#3949AB', padding: '2px 7px', borderRadius: 4, marginLeft: 'auto' },
  ruleBlockDesc: { fontSize: 13, color: '#555', lineHeight: 1.7 },
  warningBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    padding: '7px 10px',
    background: '#FFF8E1',
    border: '1px solid #FFE082',
    borderRadius: 6,
    fontSize: 12,
    color: '#795548',
    lineHeight: 1.5,
  },
  warningIcon: { flexShrink: 0 },

  groupSectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#999',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
}
