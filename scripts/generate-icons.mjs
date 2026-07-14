import { Jimp } from 'jimp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '../public')
const assetsDir = join(__dirname, '../src/assets')

async function generate() {
  const bowl = await Jimp.read(join(assetsDir, 'rice-bowl.png'))

  // 앱 메인 배경색(--color-bg)과 동일한 베이지 계열
  for (const size of [192, 512]) {
    const img = new Jimp({ width: size, height: size, color: 0xFAF8F5FF })

    // 밥공기 아이콘을 세이프존(마스커블 아이콘 대비 여백)을 두고 중앙에 배치
    const bowlResized = bowl.clone()
    const scale = (size * 0.82) / Math.max(bowl.bitmap.width, bowl.bitmap.height)
    bowlResized.resize({ w: Math.round(bowl.bitmap.width * scale), h: Math.round(bowl.bitmap.height * scale) })
    const bx = Math.round((size - bowlResized.bitmap.width) / 2)
    const by = Math.round((size - bowlResized.bitmap.height) / 2)
    img.composite(bowlResized, bx, by)

    // 모서리는 일부러 각지게 둔다 — iOS는 투명 픽셀을 검게 채워버리므로
    // 둥근 모서리는 OS/런처가 각자 마스크(스퀴클/원형 등)로 알아서 처리하게 맡긴다.
    await img.write(join(publicDir, `icon-${size}.png`))
    console.log(`✓ icon-${size}.png 생성됨`)
  }

  // 푸시 알림의 상태바 배지 아이콘(Android). OS가 알파 채널만 마스크로 쓰고 색은 무시하므로
  // 투명 배경 + 흰색 실루엣으로 만들어야 한다 — 컬러 아이콘을 그대로 쓰면 상태바에서 각지고
  // 뭉개진 회색 사각형처럼 보인다.
  const badgeSize = 96
  const badge = new Jimp({ width: badgeSize, height: badgeSize, color: 0x00000000 })
  const badgeBowl = bowl.clone()
  const badgeScale = (badgeSize * 0.82) / Math.max(bowl.bitmap.width, bowl.bitmap.height)
  badgeBowl.resize({ w: Math.round(bowl.bitmap.width * badgeScale), h: Math.round(bowl.bitmap.height * badgeScale) })
  badgeBowl.scan(0, 0, badgeBowl.bitmap.width, badgeBowl.bitmap.height, (x, y, idx) => {
    badgeBowl.bitmap.data[idx] = 255
    badgeBowl.bitmap.data[idx + 1] = 255
    badgeBowl.bitmap.data[idx + 2] = 255
  })
  const badgeX = Math.round((badgeSize - badgeBowl.bitmap.width) / 2)
  const badgeY = Math.round((badgeSize - badgeBowl.bitmap.height) / 2)
  badge.composite(badgeBowl, badgeX, badgeY)
  await badge.write(join(publicDir, 'badge-monochrome.png'))
  console.log('✓ badge-monochrome.png 생성됨')
}

generate().catch(console.error)
