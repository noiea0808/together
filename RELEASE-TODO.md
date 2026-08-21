# 정식 출시 남은 과제 (집 PC에서 진행)

비공개 테스트가 끝나서 정식 출시(또는 다음 트랙)로 넘어가는 중이다.
회사 PC에서 하려다 **릴리스 키스토어가 회사 PC엔 없어서** 막혔다 —
집에서 올렸던 것으로 보이니 나머지는 집에서 이어서 한다.

## 회사 PC에서 이미 끝난 것

- `versionCode` 1 → **2** (`android/app/build.gradle`)
  비공개 테스트로 1이 이미 Play Console에 올라가 있어 그대로면 업로드가 거부된다.
- `versionName`은 `"1.0"` 그대로 뒀다. 정식 출시라 이대로 가도 되고,
  테스트판과 구분하고 싶으면 `1.0.1`로 올린다.
- 스토어 등록 이미지는 `store/`에 이미 완비 (아이콘 512, 그래픽 1024×500, 스크린샷 7장).
  다시 뽑을 일 있으면 `store/README.md` 참고.

## 0. 최신 코드 받기

```powershell
cd C:\100_Dev\together
git pull origin staging
```

versionCode 2가 안 들어온 채로 빌드하면 업로드가 거부되니 이걸 먼저 한다.

## 1. 릴리스 키스토어 확인 ← 여기가 관문

```powershell
Test-Path C:\100_Dev\together\android\keystore.properties
Get-Content C:\100_Dev\together\android\keystore.properties
```

`keystore.properties`와 그 안 `storeFile`이 가리키는 키 파일이 **둘 다** 있어야 한다.
(둘 다 `.gitignore` 대상이라 git으로는 절대 안 따라온다. 회사 PC에 없는 이유가 이것.)

키가 맞는지는 지문으로 대조한다:

```powershell
keytool -list -v -keystore C:\100_Dev\together\gachimeokja-release.keystore -alias gachimeokja
```

찍힌 SHA-256이 아래 둘 중 하나면 맞는 키다
(`public/.well-known/assetlinks.json`에 등록돼 있는 값):

- `B1:67:DD:37:5D:E7:B3:52:25:32:F7:56:31:A7:E1:0E:3F:E7:E8:4E:04:89:31:F7:90:2E:BA:3E:4C:EA:DF:33`
- `0D:EF:75:B0:32:00:23:FD:B0:66:1C:69:86:E2:4F:40:BF:46:B3:75:8B:15:06:BB:B1:33:60:7E:B0:A8:A4:60`

둘 중 하나는 업로드 키, 다른 하나는 Play 앱 서명 키다.
어느 쪽이 업로드 키인지는 Play Console → 설정 → 앱 무결성 → 앱 서명에서 확인된다.

파일명이 기억과 다르면 통째로 훑는다:

```powershell
Get-ChildItem C:\ -Include *.keystore,*.jks -Recurse -ErrorAction SilentlyContinue | Select-Object FullName
```

### 1-B. 그래도 못 찾으면 — 업로드 키 재설정

Play App Signing이 켜져 있으면(신규 앱은 기본) **앱 서명 키는 구글이 갖고 있어서 앱은 안전하다.**
업로드 키만 새로 등록하면 된다. 새 키를 만들고:

```powershell
keytool -genkey -v -keystore C:\100_Dev\together\gachimeokja-upload.keystore -alias gachimeokja -keyalg RSA -keysize 2048 -validity 10000
```

인증서를 뽑아서:

```powershell
keytool -export -rfc -keystore C:\100_Dev\together\gachimeokja-upload.keystore -alias gachimeokja -file upload_certificate.pem
```

Play Console → 앱 무결성 → **업로드 키 재설정 요청**에 그 `.pem`을 올린다. 승인까지 며칠 걸릴 수 있다.
새 키로 가게 되면 그 SHA-256을 `public/.well-known/assetlinks.json`의
`app.eat_together.mobile` 배열에 **추가**하고(기존 값은 지우지 말 것) 웹을 다시 배포해야
App Links가 안 깨진다.

키를 찾았거나 새로 만들었으면 `android/keystore.properties`를 채운다
(양식은 `android/keystore.properties.example`):

```
storeFile=../gachimeokja-release.keystore
storePassword=...
keyAlias=gachimeokja
keyPassword=...
```

## 2. 웹 빌드 → 네이티브 동기화

```powershell
npm run build
npx cap sync android
```

이걸 건너뛰면 예전 화면이 담긴 AAB가 나온다.

## 3. AAB 빌드

```powershell
cd C:\100_Dev\together\android
.\gradlew.bat bundleRelease
```

결과물: `android/app/build/outputs/bundle/release/app-release.aab`

`keystore.properties`가 없으면 서명 없이 빌드돼 Play가 거부한다.
빌드 후 서명이 붙었는지 확인:

```powershell
jarsigner -verify -verbose C:\100_Dev\together\android\app\build\outputs\bundle\release\app-release.aab
```

## 4. Play Console 업로드

- 트랙 선택 (정식 출시 / 공개 테스트 등)
- `app-release.aab` 업로드, versionCode가 2로 잡히는지 확인
- 출시 노트 작성
- 등록정보 이미지가 이미 올라가 있는지 확인 (`store/` 파일들)

## 5. 업로드 끝나고 반드시

- **키스토어 백업.** 지금처럼 PC 한 대에만 있으면 그 PC가 날아가는 순간
  같은 앱으로 업데이트를 영영 못 올린다. 키 파일과 비밀번호를 따로,
  안전한 곳(비밀번호 관리자 / 암호화 백업)에 보관한다.
- 실기기에서 로그인·딥링크·푸시 확인 (`CAPACITOR.md` 6번 항목)

## 참고: CAPACITOR.md는 일부 낡았다

`CAPACITOR.md`는 프로덕션 appId를 `com.gachimeokja.app`으로 적고 있는데 실제로는 바뀌었다.

| | appId | 서명 |
|---|---|---|
| 프로덕션 (`android/`) | `app.eat_together.mobile` | 릴리스 키 (찾아야 하는 그것) |
| STG (`android-stg/`) | `com.gachimeokja.app` | 디버그 키 (사이드로드용) |

키스토어 정리가 끝나면 `CAPACITOR.md`도 같이 손보는 게 좋다.
