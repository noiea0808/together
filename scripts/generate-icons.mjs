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
  // 작은 크기에선 그냥 동그라미로 보인다. 그래서 사진에서 뽑아내는 대신, 그릇 윤곽과
  // 김 모락모락 표시가 살아있는 단순한 그림을 직접 픽셀로 그린다.
  //
  // 타원 두 개(그릇+밥)를 겹쳐 만들던 이전 방식은 96px에서는 그럴듯했지만, 실제 상태바
  // 표시 크기인 24dp까지 줄어들면 렌즈/UFO처럼 보여 밥공기로 안 읽혔다. 위아래가 곧은
  // 사다리꼴 컵 모양은 작은 크기에서도 "그릇"으로 또렷하게 유지된다.
  const badgeSize = 96
  const badge = new Jimp({ width: badgeSize, height: badgeSize, color: 0x00000000 })
  const WHITE = 0xffffffff

  const fillIf = (predicate) => {
    for (let y = 0; y < badgeSize; y++) {
      for (let x = 0; x < badgeSize; x++) {
        if (predicate(x, y)) badge.setPixelColor(WHITE, x, y)
      }
    }
  }

  // 곡선(2차 베지어)이 섞인 경로를 짧은 선분들로 잘게 쪼개 다각형 점 목록으로 만든다
  const flattenPath = (cmds, segments = 16) => {
    const pts = [cmds[0].p]
    let current = cmds[0].p
    for (let i = 1; i < cmds.length; i++) {
      const cmd = cmds[i]
      if (cmd.type === 'L') {
        pts.push(cmd.p)
      } else {
        const [x0, y0] = current
        const [qx, qy] = cmd.c
        const [x2, y2] = cmd.p
        for (let s = 1; s <= segments; s++) {
          const t = s / segments
          const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * qx + t ** 2 * x2
          const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * qy + t ** 2 * y2
          pts.push([x, y])
        }
      }
      current = cmd.p
    }
    return pts
  }

  const pointInPolygon = (x, y, poly) => {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
      if (intersect) inside = !inside
    }
    return inside
  }

  // 그릇 — 위가 넓고 아래로 갈수록 좁아지는 사다리꼴, 바닥 모서리만 둥글게
  const bowlPolygon = flattenPath([
    { p: [14, 34] },
    { type: 'L', p: [82, 34] },
    { type: 'Q', c: [80, 50], p: [76, 64] },
    { type: 'Q', c: [73, 78], p: [58, 78] },
    { type: 'L', p: [38, 78] },
    { type: 'Q', c: [23, 78], p: [20, 64] },
    { type: 'Q', c: [16, 50], p: [14, 34] },
  ])
  fillIf((x, y) => pointInPolygon(x, y, bowlPolygon))

  // 받침대
  fillIf((x, y) => y >= 80 && y < 87 && x >= 38 && x < 58)

  // 김 — 세 가닥 모두 같은 방향(왼쪽)으로 살짝 휘어 바람에 날리는 느낌으로 통일한다.
  // 방향이 제각각이면 작은 크기에서 더듬이처럼 보여 산만해진다.
  const cubicStroke = (p0, c1, c2, p3, thickness) => {
    const steps = 24
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const mt = 1 - t
      const px = mt ** 3 * p0[0] + 3 * mt ** 2 * t * c1[0] + 3 * mt * t ** 2 * c2[0] + t ** 3 * p3[0]
      const py = mt ** 3 * p0[1] + 3 * mt ** 2 * t * c1[1] + 3 * mt * t ** 2 * c2[1] + t ** 3 * p3[1]
      for (let ox = -thickness / 2; ox <= thickness / 2; ox++) {
        for (let oy = -thickness / 2; oy <= thickness / 2; oy++) {
          const xx = Math.round(px + ox), yy = Math.round(py + oy)
          if (xx >= 0 && xx < badgeSize && yy >= 0 && yy < badgeSize) badge.setPixelColor(WHITE, xx, yy)
        }
      }
    }
  }
  cubicStroke([31, 27], [31, 27], [26, 19], [30, 9], 6)
  cubicStroke([49, 29], [49, 29], [44, 19], [48, 8], 6)
  cubicStroke([67, 27], [67, 27], [62, 19], [66, 9], 6)

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
