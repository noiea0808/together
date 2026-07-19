// 서버리스 함수가 외부 URL을 대신 요청할 때 쓰는 공용 SSRF 가드.
// (파일명이 _로 시작해 Vercel은 이 파일을 라우트로 만들지 않고 헬퍼로만 번들한다.)

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

// rawUrl을 파싱하고 http/https + 공개 호스트인지 검증한다.
// 통과하면 { url }, 실패하면 { error }를 반환한다.
export function parseSafeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return { error: 'url required' }
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return { error: 'invalid url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'unsupported protocol' }
  if (isBlockedHost(url.hostname)) return { error: 'blocked host' }
  return { url }
}

// parseSafeUrl은 최초 URL의 호스트만 검사한다. fetch에 redirect:'follow'를 그대로 쓰면
// 검사를 통과한 공개 URL이 3xx로 사설 IP/localhost로 리다이렉트했을 때 그대로 따라가버려
// SSRF 가드를 우회당한다. 그래서 매 홉마다 redirect:'manual'로 받아 Location을 직접
// parseSafeUrl로 재검증한 뒤에만 다음 요청을 보낸다.
export async function safeFetch(initialUrl, options = {}, maxRedirects = 3) {
  let current = initialUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(current.href, { ...options, redirect: 'manual' })
    const isRedirect = res.status >= 300 && res.status < 400
    if (!isRedirect) return res

    const location = res.headers.get('location')
    if (!location) return res
    let nextUrl
    try {
      nextUrl = new URL(location, current)
    } catch {
      throw new Error('invalid redirect location')
    }
    const { url: validated, error } = parseSafeUrl(nextUrl.href)
    if (error) throw new Error(`blocked redirect target: ${error}`)
    current = validated
  }
  throw new Error('too many redirects')
}
