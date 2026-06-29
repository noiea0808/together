import { Jimp } from 'jimp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '../public')

async function generate() {
  for (const size of [192, 512]) {
    const img = new Jimp({ width: size, height: size, color: 0xFF6B35FF })

    // 둥근 모서리 효과 (수동으로 네 모서리 픽셀 제거)
    const r = size * 0.2
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const inCorner =
          (x < r && y < r && Math.hypot(x - r, y - r) > r) ||
          (x > size - r && y < r && Math.hypot(x - (size - r), y - r) > r) ||
          (x < r && y > size - r && Math.hypot(x - r, y - (size - r)) > r) ||
          (x > size - r && y > size - r && Math.hypot(x - (size - r), y - (size - r)) > r)
        if (inCorner) img.setPixelColor(0x00000000, x, y)
      }
    }

    await img.write(join(publicDir, `icon-${size}.png`))
    console.log(`✓ icon-${size}.png 생성됨`)
  }
}

generate().catch(console.error)
