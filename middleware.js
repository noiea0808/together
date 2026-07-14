// 카카오톡 등 메신저로 초대 링크를 공유할 때 뜨는 미리보기 카드를 위한 Vercel Edge Middleware.
// 이 앱은 SPA라 모든 경로가 동일한 index.html을 반환하는데(vercel.json rewrite),
// 링크 미리보기를 만드는 크롤러는 JS를 실행하지 않고 최초 응답의 <head> 태그만 읽는다.
// 그래서 /join/:code(그룹 초대), /pot/:id(밥팟 초대) 요청만 가로채 그 경로에 맞는
// og:title/og:description으로 바꿔치기한 index.html을 내려준다. 실제 화면 동작(라우팅,
// 로그인 등)은 그대로 index.html이 로드된 뒤 클라이언트 라우터가 처리하므로 영향 없다.

export const config = {
  matcher: ['/join/:code*', '/pot/:id*'],
}

function metaFor(pathname) {
  if (pathname.startsWith('/join/')) {
    return {
      title: '그룹에 초대되었어요 🍚',
      description: '같이 먹자에서 그룹에 참여하고, 오늘 같이 먹을 사람을 찾아보세요.',
    }
  }
  return {
    title: '밥팟에 초대되었어요 🍚',
    description: '같이 먹자에서 이 밥팟에 참여해보세요.',
  }
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const { title, description } = metaFor(url.pathname)
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
