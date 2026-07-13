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
}

generate().catch(console.error)
