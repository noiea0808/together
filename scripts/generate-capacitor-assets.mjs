import { Jimp } from 'jimp'
import { mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const assetsDir = join(__dirname, '../src/assets')
const resourcesDir = join(__dirname, '../resources')

// generate-icons.mjs와 같은 배경색·세이프존 비율을 쓴다 — 네이티브 앱은 브랜치 구분이
// 필요 없는 단일 배포라 스테이징 색 분기는 두지 않는다.
const ICON_BG = 0xfaf8f5ff

async function composite(size, safeZoneRatio) {
  const bowl = await Jimp.read(join(assetsDir, 'rice-bowl.png'))
  const img = new Jimp({ width: size, height: size, color: ICON_BG })

  const bowlResized = bowl.clone()
  const scale = (size * safeZoneRatio) / Math.max(bowl.bitmap.width, bowl.bitmap.height)
  bowlResized.resize({ w: Math.round(bowl.bitmap.width * scale), h: Math.round(bowl.bitmap.height * scale) })
  const bx = Math.round((size - bowlResized.bitmap.width) / 2)
  const by = Math.round((size - bowlResized.bitmap.height) / 2)
  img.composite(bowlResized, bx, by)
  return img
}

async function generate() {
  await mkdir(resourcesDir, { recursive: true })

  // 플레이스토어 고해상도 아이콘 + @capacitor/assets 소스 — 82% 세이프존은 기존
  // PWA 아이콘(icon-192/512)과 동일한 비율.
  const icon = await composite(1024, 0.82)
  await icon.write(join(resourcesDir, 'icon.png'))
  console.log('✓ resources/icon.png 생성됨')

  // 스플래시는 아이콘보다 훨씬 넓은 캔버스 중앙에 작게 배치하는 게 관례.
  const splash = await composite(2732, 0.35)
  await splash.write(join(resourcesDir, 'splash.png'))
  console.log('✓ resources/splash.png 생성됨')

  console.log('다음: npx @capacitor/assets generate --android 로 전체 밀도 아이콘/스플래시 생성')
}

generate().catch(console.error)
