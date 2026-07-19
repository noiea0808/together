// 메모에 붙여넣은 링크의 미리보기(썸네일/제목/설명)를 가져오는 서버리스 함수.
// 브라우저에서 바로 외부 사이트를 fetch하면 대부분 CORS로 막히기 때문에 서버를 거친다.
import { parseSafeUrl, safeFetch } from './_url-guard.js'

const FETCH_TIMEOUT_MS = 6000
const READ_BUDGET_MS = 8000 // </head> 검색용 스트림 읽기 전체에 허용하는 시간
const MAX_HTML_BYTES = 3_000_000 // 유튜브처럼 <head> 안에 인라인 스크립트가 커서 og 태그가
// 수백KB 뒤에 나오는 사이트가 있어, </head>를 찾을 때까지 읽되 이 값을 안전장치로 둔다.

// blog.naver.com/{blogId}/{logNo} 축약 URL은 실제 글 내용이 없는 프레임셋 껍데기라
// og 태그가 블로그 이름뿐인 상위 정보만 나온다. 같은 글의 PostView.naver 쿼리 형식
// 페이지에는 게시물별 og 태그가 정상적으로 들어있어, 요청만 그쪽으로 바꿔준다.
function resolveFetchUrl(target) {
  if (target.hostname === 'blog.naver.com') {
    const m = target.pathname.match(/^\/([\w-]+)\/(\d+)\/?$/)
    if (m) {
      const [, blogId, logNo] = m
      return new URL(`https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`)
    }
  }
  return target
}

function extractMeta(html) {
  const pick = (re) => html.match(re)?.[1]

  const metaByProp = (prop) =>
    pick(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i')) ||
    pick(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'))

  const decode = (s) =>
    s
      ?.replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()

  return {
    title: decode(metaByProp('og:title')) || decode(pick(/<title[^>]*>([^<]*)<\/title>/i)),
    description: decode(metaByProp('og:description')) || decode(metaByProp('description')),
    image: decode(metaByProp('og:image')),
    siteName: decode(metaByProp('og:site_name')),
  }
}

export default async function handler(req, res) {
  const { url: target, error } = parseSafeUrl(req.query?.url)
  if (error) {
    res.status(400).json({ error })
    return
  }

  const fetchUrl = resolveFetchUrl(target)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await safeFetch(fetchUrl, {
      signal: controller.signal,
      headers: {
        // facebookexternalhit 같은 봇 UA는 위키피디아처럼 오히려 차단하는 사이트가 있어
        // 실제 데스크톱 브라우저 UA를 쓴다. 커스텀/봇 UA로는 로그인·JS 렌더링을 요구하는
        // 사이트가 글 상세 대신 홈/상위 페이지의 공용 og 태그만 내려주는 경우가 많았는데,
        // 일반 브라우저처럼 요청하면 서버가 SEO용으로 이미 페이지별 og 태그를 원본 HTML에
        // 담아 보내주는 경우가 대부분이라 더 안정적으로 해당 페이지 정보를 받아온다.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    })
    clearTimeout(timer)

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') || !response.body) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
      res.status(200).json({ url: target.href, siteName: target.hostname })
      return
    }

    // </head>가 나올 때까지 읽는다 (멀티바이트 문자가 청크 경계에서 잘리지 않도록
    // TextDecoder를 스트리밍 모드로 사용). MAX_HTML_BYTES/READ_BUDGET_MS는 안전장치.
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    const readStartedAt = Date.now()
    let html = ''
    let received = 0
    while (received < MAX_HTML_BYTES && Date.now() - readStartedAt < READ_BUDGET_MS) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.length
      html += decoder.decode(value, { stream: true })
      if (html.includes('</head>')) break
    }
    reader.cancel().catch(() => {})

    const meta = extractMeta(html)
    let image = meta.image || null
    if (image && !/^https?:\/\//i.test(image)) {
      try { image = new URL(image, response.url || fetchUrl.href).href } catch { image = null }
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
    res.status(200).json({
      url: target.href,
      title: meta.title || target.hostname,
      description: meta.description || null,
      image,
      siteName: meta.siteName || target.hostname,
    })
  } catch {
    clearTimeout(timer)
    res.status(200).json({ url: target.href, siteName: target.hostname })
  }
}
