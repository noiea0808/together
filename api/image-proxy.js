// 링크 미리보기 썸네일을 우리 도메인에서 대신 서빙하는 이미지 프록시.
// 네이버(pstatic.net) 등 일부 CDN은 Referer로 핫링크를 차단해, 우리 앱 페이지에서
// <img>로 바로 불러오면 배포 도메인 Referer 때문에 403이 난다. 서버에서 대신 받아
// 스트리밍하면 서드파티 CDN의 핫링크 정책과 무관하게 항상 이미지를 보여줄 수 있다.
import { parseSafeUrl } from './_url-guard.js'

const FETCH_TIMEOUT_MS = 6000
const MAX_IMAGE_BYTES = 8_000_000

export default async function handler(req, res) {
  const { url, error } = parseSafeUrl(req.query?.url)
  if (error) {
    res.status(400).json({ error })
    return
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    })
    clearTimeout(timer)

    const contentType = response.headers.get('content-type') || ''
    if (!response.ok || !contentType.startsWith('image/')) {
      res.status(502).json({ error: 'not an image' })
      return
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_IMAGE_BYTES) {
      res.status(502).json({ error: 'image too large' })
      return
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=2592000, immutable')
    res.status(200).send(buffer)
  } catch {
    clearTimeout(timer)
    res.status(502).json({ error: 'fetch failed' })
  }
}
