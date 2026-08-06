// STG 네이티브 프로젝트(android-stg/)용 cap CLI 실행기.
// 이 Capacitor CLI 버전(8.4.2)은 `cap <cmd> --config <file>` 플래그가 없고 cwd의
// capacitor.config.json만 읽는다. 그래서 capacitor.config.stg.json을
// capacitor.config.json 자리에 잠깐 바꿔치기해 cap CLI를 실행한 뒤 원래대로 되돌린다.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const CONFIG = 'capacitor.config.json'
const STG_CONFIG = 'capacitor.config.stg.json'

const [, , subcommand, ...rest] = process.argv
if (!subcommand) {
  console.error('사용법: node scripts/cap-stg.mjs <add|sync|open> [android]')
  process.exit(1)
}

const original = readFileSync(CONFIG, 'utf8')
copyFileSync(STG_CONFIG, CONFIG)

try {
  const result = spawnSync('npx', ['cap', subcommand, 'android', ...rest], {
    stdio: 'inherit',
    shell: true,
  })
  process.exitCode = result.status ?? 1
} finally {
  writeFileSync(CONFIG, original)
}
