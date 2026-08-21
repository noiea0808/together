import { getPublicOrigin } from './platform'

const URL_RE = /https?:\/\/[^\s]+/i

export function extractFirstUrl(text) {
  const match = text?.match(URL_RE)
  if (!match) return null
  return match[0].replace(/[)\]}>.,!?"']+$/, '')
}

// 링크가 섞인 텍스트를 카드로 미리보기 할 때, 원문에서 그 주소 부분만 잘라내고
// 나머지 메모만 카드 뒤에 이어서 보여주기 위한 헬퍼.
export function textWithoutUrl(content, url) {
  if (!url) return content
  const idx = content.indexOf(url)
  if (idx === -1) return content
  return (content.slice(0, idx) + content.slice(idx + url.length)).trim()
}

// 썸네일은 우리 이미지 프록시를 거쳐 불러온다. 네이버 등 일부 CDN이 Referer로
// 핫링크를 차단해 <img>로 직접 부르면 배포 도메인에서 403이 나기 때문이다.
export function proxiedImageUrl(imageUrl) {
  return `${getPublicOrigin()}/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
}

// 링크 미리보기(og:title/description/image) 조회. 서버가 항상 최소한
// { url, siteName }은 채워서 200으로 응답하므로(api/link-preview.js), 여기서 null이 오는 건
// 요청 자체가 못 나간 경우(네트워크 단절 등)뿐이다 — "아직 시도 안 함"과 구분하는 신호로 쓴다.
export async function fetchLinkPreview(url) {
  try {
    const res = await fetch(`${getPublicOrigin()}/api/link-preview?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
