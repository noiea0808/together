// 카카오톡 등 메신저로 초대 링크를 공유할 때 뜨는 미리보기 카드를 위한 Vercel Edge Middleware.
// 이 앱은 SPA라 모든 경로가 동일한 index.html을 반환하는데(vercel.json rewrite),
// 링크 미리보기를 만드는 크롤러는 JS를 실행하지 않고 최초 응답의 <head> 태그만 읽는다.
// 그래서 /join/:code(그룹 초대), /pot/:id(밥팟 초대) 요청만 가로채 그 경로에 맞는
// og:title/og:description으로 바꿔치기한 index.html을 내려준다. 실제 화면 동작(라우팅,
// 로그인 등)은 그대로 index.html이 로드된 뒤 클라이언트 라우터가 처리하므로 영향 없다.
//
// 그룹명/밥팟 정보까지 보여주기 위해 Supabase RPC(get_group_invite_preview,
// get_pot_invite_preview — scripts/add_invite_preview_rpc.sql)를 로그인 없이 anon key로
// 호출한다. RLS를 직접 열어주는 대신 필요한 컬럼만 반환하는 SECURITY DEFINER 함수를 거친다.

export const config = {
  matcher: ['/join/:code*', '/pot/:id*'],
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const DEFAULT_JOIN = {
  title: '그룹에 초대되었어요 🍚',
  description: '같이 먹자에서 그룹에 참여하고, 오늘 같이 먹을 사람을 찾아보세요.',
}
const DEFAULT_POT = {
  title: '밥팟에 초대되었어요 🍚',
  description: '같이 먹자에서 이 밥팟에 참여해보세요.',
}

async function callRpc(fn, params) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(params),
    })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? (data[0] ?? null) : data
  } catch {
    return null
  }
}

function buildPotDescription(pot) {
  const parts = []
  if (pot.slot) parts.push(pot.slot)
  if (pot.meal_time) {
    const start = pot.meal_time.slice(0, 5)
    const end = pot.end_time ? `~${pot.end_time.slice(0, 5)}` : ''
    parts.push(`${start}${end}`)
  }
  if (pot.menu) parts.push(pot.menu)
  const detail = parts.length > 0 ? parts.join(' · ') : '시간 미정'
  return pot.group_name ? `${pot.group_name} · ${detail}` : detail
}

async function metaFor(pathname) {
  if (pathname.startsWith('/join/')) {
    const code = pathname.split('/')[2]
    const group = code && (await callRpc('get_group_invite_preview', { p_code: code }))
    if (group?.name) {
      return {
        title: `${group.name} 그룹에 초대되었어요 🍚`,
        description: `"${group.name}"에서 함께 먹을 사람을 찾고 있어요. 같이 먹자에서 참여해보세요.`,
      }
    }
    return DEFAULT_JOIN
  }

  const id = pathname.split('/')[2]
  const pot = id && (await callRpc('get_pot_invite_preview', { p_id: id }))
  if (pot) {
    return {
      title: `${pot.title || '밥팟'}에 초대되었어요 🍚`,
      description: buildPotDescription(pot),
    }
  }
  return DEFAULT_POT
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const { title, description } = await metaFor(url.pathname)
  const imageUrl = `${url.origin}/icon-512.png`

  const res = await fetch(new URL('/index.html', url))
  let html = await res.text()

  html = html
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content=".*?"\s*\/>/, `<meta name="description" content="${description}" />`)
    .replace(/<meta property="og:title" content=".*?"\s*\/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content=".*?"\s*\/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:image" content=".*?"\s*\/>/, `<meta property="og:image" content="${imageUrl}" />`)
    .replace(/<meta name="twitter:title" content=".*?"\s*\/>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta name="twitter:description" content=".*?"\s*\/>/, `<meta name="twitter:description" content="${description}" />`)
    .replace(/<meta name="twitter:image" content=".*?"\s*\/>/, `<meta name="twitter:image" content="${imageUrl}" />`)
    .replace('</head>', `<meta property="og:url" content="${url.href}" />\n  </head>`)

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
