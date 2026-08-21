// 여러 장 한꺼번에 올릴 때 쓰는 리사이즈 전용 함수 — 크롭 없이 원본 비율 그대로,
// maxWidth × maxHeight 상자 안에 들어가도록만 줄이고 재인코딩한다.

// 스샷처럼 글자·선이 많은 이미지는 JPEG로 재인코딩하면 글자 가장자리에 링잉이 생겨
// 눈에 띄게 흐려진다. WebP는 같은 용량에서 이런 경계가 훨씬 덜 뭉개져 우선 사용한다.
let webpEncodable = null
function canEncodeWebp() {
  if (webpEncodable === null) {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    webpEncodable = c.toDataURL('image/webp').startsWith('data:image/webp')
  }
  return webpEncodable
}

const PASSTHROUGH_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/**
 * @param {File} file
 * @param {object} [opts]
 * @param {number} [opts.maxWidth]   가로 상한 (화면에 그려지는 폭이 좌우되는 값)
 * @param {number} [opts.maxHeight]  세로 상한
 * @param {number} [opts.quality]    재인코딩 품질(0~1)
 * @param {number} [opts.passthroughMaxBytes] 줄일 필요가 없을 때 원본을 그대로 쓸 용량 상한
 */
export function resizeImageFile(file, opts = {}) {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.85,
    passthroughMaxBytes = 1_500_000,
  } = opts

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width: srcW, height: srcH } = img

      // 줄일 필요도 없는데 재인코딩하면 화질만 한 번 더 깎인다(세대 손실).
      // 용량이 부담 없는 크기면 원본을 그대로 올려 원래 선명도를 유지한다.
      const fits = srcW <= maxWidth && srcH <= maxHeight
      if (fits && file.size <= passthroughMaxBytes && PASSTHROUGH_TYPES.includes(file.type)) {
        resolve(file)
        return
      }

      // 가로·세로 각각의 상한을 동시에 만족하는 배율. 긴 변만 제한하면 세로로 긴
      // 스샷은 가로가 과하게 작아져(예: 1080×2400 → 720×1600) 화면 폭보다 낮은
      // 해상도로 올라가 늘려 그려지면서 흐릿해진다.
      const scale = Math.min(1, maxWidth / srcW, maxHeight / srcH)
      const width = Math.round(srcW * scale)
      const height = Math.round(srcH * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)

      const type = canEncodeWebp() ? 'image/webp' : 'image/jpeg'
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했어요.')),
        type,
        quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 불러올 수 없어요.')) }
    img.src = url
  })
}

// 업로드 경로 확장자를 blob 타입에 맞춰 정한다 — 원본 통과(PNG)와 WebP 재인코딩이
// 섞이므로 .jpg로 못박아두면 실제 내용과 다른 확장자/Content-Type이 올라간다.
export function imageExtFor(blob) {
  return { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[blob?.type] ?? 'jpg'
}
