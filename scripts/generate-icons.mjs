import { Jimp } from 'jimp'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '../public')
const assetsDir = join(__dirname, '../src/assets')

// Vercel이 빌드 시점에 심어주는 브랜치명으로 스테이징 배포를 구분한다. 로컬 빌드(npm run build)나
// 프로덕션 브랜치에서는 undefined/'main'이라 자연히 운영용 색으로 떨어진다.
const isStaging = process.env.VERCEL_GIT_COMMIT_REF === 'staging'

// 운영과 스테이징을 홈 화면에서 한눈에 구분하기 위한 아이콘 배경색.
// 브랜드 주황(--color-primary, #FF6B35)을 그대로 쓰면 밥공기 자체도 비슷한 주황이라
// 배경에 묻혀버려서, 톤이 더 진한 --color-primary-dark(#E05520)를 스테이징 배경으로 쓴다.
const ICON_BG = isStaging ? 0xe05520ff : 0xfaf8f5ff
const MANIFEST_BG = isStaging ? '#E05520' : '#FAF8F5'

async function generate() {
  const bowl = await Jimp.read(join(assetsDir, 'rice-bowl.png'))

  for (const size of [192, 512]) {
    const img = new Jimp({ width: size, height: size, color: ICON_BG })

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
  //
  // 실제 밥공기 사진(rice-bowl.png)의 실루엣을 그대로 단색화하면 그릇+밥이 뭉쳐서
  // 작은 크기에선 그냥 동그라미로 보인다. 그래서 사진에서 뽑아내는 대신, 그릇 테두리
  // 틈과 김 모락모락 표시가 살아있는 단순한 그림을 직접 픽셀로 그린다.
  //
  // 그릇과 밥 사이에 틈(안 채운 픽셀 band)을 두면 96px에서는 테두리 선처럼 보이지만,
  // 실제 상태바 표시 크기인 24dp까지 줄어들면 그 틈이 두 개의 분리된 도형(눈사람/UFO)처럼
  // 보여버려 밥공기로 안 읽힌다. 그래서 밥과 그릇을 틈 없이 하나로 이어 붙인 실루엣으로 그린다.
  const badgeSize = 96
  const badge = new Jimp({ width: badgeSize, height: badgeSize, color: 0x00000000 })
  const WHITE = 0xffffffff
  const cx = badgeSize / 2

  const fillIf = (predicate) => {
    for (let y = 0; y < badgeSize; y++) {
      for (let x = 0; x < badgeSize; x++) {
        if (predicate(x, y)) badge.setPixelColor(WHITE, x, y)
      }
    }
  }

  // 그릇 몸통 — 넓고 얕은 타원 아랫부분만 남겨 사발(컵) 모양을 만든다
  const bowlCx = cx, bowlCy = 56, bowlRx = 34, bowlRy = 22
  fillIf((x, y) => y >= bowlCy && ((x - bowlCx) ** 2) / bowlRx ** 2 + ((y - bowlCy) ** 2) / bowlRy ** 2 <= 1)

  // 받침대
  fillIf((x, y) => y >= 80 && y < 86 && Math.abs(x - cx) <= 9)

  // 밥 — 그릇 위에 봉긋 쌓인 언덕. 그릇 라인(bowlCy)에서 바로 이어 붙여 틈 없는 하나의
  // 실루엣으로 합친다 — 폭이 그릇보다 좁아 자연스러운 잘록한 허리(테두리 느낌)만 남는다
  const riceCx = cx, riceCy = bowlCy, riceRx = 26, riceRy = 16
  fillIf((x, y) => y <= riceCy && ((x - riceCx) ** 2) / riceRx ** 2 + ((y - riceCy) ** 2) / riceRy ** 2 <= 1)

  // 김 — 밥 위에 짧고 굵게, 서로 더 가깝게 모아서 작은 크기에서도 "귀"처럼 안 보이고
  // 하나의 김 뭉치로 읽히게 한다
  const steamStroke = (x0, y0, x1, y1, thickness) => {
    const steps = 20
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const px = x0 + (x1 - x0) * t
      const py = y0 + (y1 - y0) * t
      for (let ox = -thickness / 2; ox <= thickness / 2; ox++) {
        for (let oy = -thickness / 2; oy <= thickness / 2; oy++) {
          const xx = Math.round(px + ox), yy = Math.round(py + oy)
          if (xx >= 0 && xx < badgeSize && yy >= 0 && yy < badgeSize) badge.setPixelColor(WHITE, xx, yy)
        }
      }
    }
  }
  steamStroke(cx - 4, 29, cx - 5, 20, 5)
  steamStroke(cx + 4, 29, cx + 5, 20, 5)

  await badge.write(join(publicDir, 'badge-monochrome.png'))
  console.log('✓ badge-monochrome.png 생성됨')

  // 같은 흰색 실루엣을 Capacitor 네이티브 앱(FCM)의 상태바 알림 아이콘으로도 쓴다.
  // AndroidManifest.xml의 com.google.firebase.messaging.default_notification_icon이
  // 이 리소스(@drawable/ic_stat_notify)를 가리킨다 — 지정 안 하면 FCM이 컬러 런처 아이콘을
  // 그대로 상태바에 욱여넣어 뭉개진 회색 사각형처럼 보인다.
  const notifyIconSizes = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 }
  for (const androidRoot of ['android', 'android-stg']) {
    const resDir = join(__dirname, '..', androidRoot, 'app/src/main/res')
    if (!existsSync(resDir)) continue
    for (const [density, px] of Object.entries(notifyIconSizes)) {
      const dir = join(resDir, `drawable-${density}`)
      await mkdir(dir, { recursive: true })
      const resized = badge.clone().resize({ w: px, h: px })
      await resized.write(join(dir, 'ic_stat_notify.png'))
    }
    console.log(`✓ ${androidRoot}: ic_stat_notify.png (알림 아이콘) 생성됨`)
  }

  // 스테이징에선 아이콘 배경색뿐 아니라 홈 화면에 뜨는 이름도 (STG)를 붙여서,
  // 아이콘 색만으로 구분이 안 갈 때(작은 위젯, 흑백 모드 등)도 확실히 구분되게 한다.
  const manifest = {
    name: isStaging ? '같이 먹자 (STG)' : '같이 먹자',
    short_name: isStaging ? '같이먹자 STG' : '같이먹자',
    description: '오늘 같이 먹을 사람, 묻지 말고 확인하기',
    start_url: '/',
    display: 'standalone',
    background_color: MANIFEST_BG,
    theme_color: '#FF6B35',
    orientation: 'portrait',
    lang: 'ko',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  await writeFile(join(publicDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`✓ manifest.json 생성됨 (${isStaging ? 'staging' : 'production'})`)
}

generate().catch(console.error)
