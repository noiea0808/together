# 정식 출시 남은 과제

비공개 테스트가 끝나서 정식 출시(또는 다음 트랙)로 넘어가는 중이다.

**현재 상태: 릴리스 키스토어를 되찾았고, 서명된 AAB까지 나왔다 (2026-08-21).**
회사 PC에서 만들어 둔 암호화 백업(`gachimeokja-signing-backup.tar.gz.gpg`)을 집 PC로 옮겨와
복원했다. 업로드 키 재설정은 **불필요**해졌다. 남은 건 Play Console 업로드뿐이다.

## 이미 끝난 것

- `versionCode` 1 → **2** (`android/app/build.gradle`)
  비공개 테스트로 1이 이미 Play Console에 올라가 있어 그대로면 업로드가 거부된다.
- `versionName`은 `"1.0"` 그대로. 정식 출시라 이대로 가도 되고,
  테스트판과 구분하고 싶으면 `1.0.1`로 올린다.
- 집 PC(`E:\200. Dev\Together`) 기준으로 **빌드 툴체인 검증 완료** (2026-08-21)
  - `npm run build` → `npx cap sync android` → `gradlew bundleRelease` 전부 통과
  - `BUILD SUCCESSFUL`, 산출물 13.3MB
- **릴리스 키스토어 복원 + 서명된 제출용 AAB 빌드 완료** (2026-08-21)
  - `android/app/build/outputs/bundle/release/app-release.aab`, 13.3MB
  - `jarsigner -verify` → `jar verified.`
  - 서명 인증서 SHA-256이 `assetlinks.json`의 업로드 키 지문과 일치 확인

## 0. 집 PC 환경 메모

- Android SDK가 기본 위치가 아니라 **`C:\Users\Public`** 에 깔려 있다.
  `android/local.properties`에 아래처럼 잡아줘야 gradle이 SDK를 찾는다 (gitignore 대상이라 매번 새로 만들어야 함):

  ```
  sdk.dir=C\:\Users\Public
  ```

- JDK 21 (Temurin), Node 24 확인됨.

## 1. 키스토어 — 복원 완료

암호화 백업을 회사 PC에서 옮겨와 프로젝트 루트에서 풀었다:

```powershell
& "C:\Program Files\Git\usr\bin\gpg.exe" --output gmj-backup.tar.gz --decrypt gachimeokja-signing-backup.tar.gz.gpg
tar -xzf gmj-backup.tar.gz
```

(PowerShell PATH에는 `gpg`가 없다. Git for Windows에 딸려온 걸 전체 경로로 부르거나 Git Bash에서 실행한다.)

안에 든 것:

| 파일 | 배치 위치 |
|---|---|
| `gachimeokja-release.keystore` | 프로젝트 루트 |
| `keystore.properties` | `android/` |

`keystore.properties`의 `storeFile`은 `../../gachimeokja-release.keystore`다.
gradle의 `file()`이 `android/app/` 기준으로 풀리기 때문에 이 값이 맞다
(`keystore.properties.example`이 `../`로 적고 있던 건 오류라 고쳤다).

### 키가 맞는지 확인한 방법

```powershell
keytool -list -v -keystore gachimeokja-release.keystore -alias gachimeokja
```

나온 SHA-256이 `public/.well-known/assetlinks.json`의 `app.eat_together.mobile` 지문
**첫 번째 값과 일치**했다 (`B1:67:DD:...:4C:EA:DF:33`). 두 번째 값
(`0D:EF:75:...:B0:A8:A4:60`)은 Play 앱 서명 키다.

→ 업로드 키 재설정 요청, 구글 승인 대기, `assetlinks.json` 수정과 웹 재배포는 **전부 불필요**하다.

### 이 파일들은 커밋되지 않는다

`.gitignore`에 `*.keystore`, `android/keystore.properties`에 더해
`*.gpg`, `gachimeokja-signing-backup*`, `gmj-backup*`을 추가해 뒀다.
압축을 푼 뒤 `gmj-backup.tar.gz`는 지워도 된다.

## 2. 웹 빌드 → 네이티브 동기화

```powershell
npm run build
npx cap sync android
```

이걸 건너뛰면 예전 화면이 담긴 AAB가 나온다.

## 3. AAB 빌드

```powershell
cd "E:\200. Dev\Together\android"
.\gradlew.bat bundleRelease
```

결과물: `android/app/build/outputs/bundle/release/app-release.aab`

빌드 후 서명이 붙었는지 반드시 확인 — `jar is unsigned`가 나오면 Play가 거부한다
(2026-08-21 기준 `jar verified.` 확인됨):

```powershell
jarsigner -verify -verbose "E:\200. Dev\Together\android\app\build\outputs\bundle\release\app-release.aab"
```

## 4. 스토어 등록정보 — 이 저장소엔 없다

이전 메모는 "`store/`에 아이콘 512, 그래픽 1024×500, 스크린샷 7장 완비"라고 적고 있었지만,
**`store/` 폴더는 이 저장소에 커밋된 적이 없다** (`.gitignore` 대상도 아닌데 추적 이력이 없음).
회사 PC 로컬에만 있었던 것으로 보인다. 필요하면 다시 뽑아야 한다.

Play Console에 이미 업로드돼 있는 등록정보는 콘솔에서 그대로 재사용하면 되니,
정식 출시만 목표라면 이미지가 로컬에 없어도 진행에는 문제없다.

## 5. Play Console 업로드

- 트랙 선택 (정식 출시 / 공개 테스트 등)
- `app-release.aab` 업로드, versionCode가 2로 잡히는지 확인
- 출시 노트 작성
- 등록정보 이미지가 이미 올라가 있는지 확인

## 6. 업로드 끝나고 반드시

- **키스토어 백업 이중화.** 이번엔 회사 PC의 암호화 백업이 살아 있어서 구제됐지만,
  그 백업이 회사 PC 한 곳에만 있었던 게 문제였다.
  키 파일과 비밀번호를 서로 다른 곳(비밀번호 관리자 + 오프사이트 암호화 백업)에 이중으로 보관한다.
- 실기기에서 로그인·딥링크·푸시 확인 (`CAPACITOR.md` 6번 항목)

## 참고: CAPACITOR.md는 일부 낡았다

`CAPACITOR.md`는 프로덕션 appId를 `com.gachimeokja.app`으로 적고 있는데 실제로는 바뀌었다.

| | appId | 서명 |
|---|---|---|
| 프로덕션 (`android/`) | `app.eat_together.mobile` | 릴리스 키 (복원 완료) |
| STG (`android-stg/`) | `com.gachimeokja.app` | 디버그 키 (사이드로드용) |

`CAPACITOR.md`도 같이 손보는 게 좋다.
