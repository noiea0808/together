// 메모에 붙여넣은 링크의 미리보기(썸네일/제목/설명)를 가져오는 서버리스 함수.
// 브라우저에서 바로 외부 사이트를 fetch하면 대부분 CORS로 막히기 때문에 서버를 거친다.
const FETCH_TIMEOUT_MS = 5000
const MAX_HTML_BYTES = 300_000 // head 태그만 필요하므로 앞부분만 읽는다

function isBlockedHost(hostname) {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0' || h === '::1') return true
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = ipv4.slice(1, 3).map(Number)
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }
  return false
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
  const rawUrl = req.query?.url
  if (!rawUrl || typeof rawUrl !== 'string') {
    res.status(400).json({ error: 'url required' })
    return
  }

  let target
  try {
    target = new URL(rawUrl)
  } catch {
    res.status(400).json({ error: 'invalid url' })
    return
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    res.status(400).json({ error: 'unsupported protocol' })
    return
  }
  if (isBlockedHost(target.hostname)) {
    res.status(400).json({ error: 'blocked host' })
    return
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(target.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GachiMeokjaLinkPreview/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    clearTimeout(timer)

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') || !response.body) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
      res.status(200).json({ url: target.href, siteName: target.hostname })
      return
    }

    // head만 필요하니 스트림을 MAX_HTML_BYTES까지만 읽고 중단한다.
    const reader = response.body.getReader()
    const chunks = []
    let received = 0
    while (received < MAX_HTML_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
    }
    reader.cancel().catch(() => {})
    const html = Buffer.concat(chunks).toString('utf-8')

    const meta = extractMeta(html)
    let image = meta.image || null
    if (image && !/^https?:\/\//i.test(image)) {
      try { image = new URL(image, target.href).href } catch { image = null }
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
