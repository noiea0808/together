# 안드로이드 앱(커패시터) 빌드·배포 가이드

이 문서는 코드/설정 스캐폴딩이 끝난 뒤, **Android Studio/SDK가 설치된 로컬 환경**에서 사용자가 직접 진행해야 하는 단계를 정리한다. `android/` 폴더는 이미 생성돼 있고 `capacitor.config.json`(appId `com.gachimeokja.app`)도 커밋돼 있다.

## 1. 열기 & 동기화

```bash
npm run cap:sync
npx cap open android
```

Android Studio가 열리면 Gradle sync가 자동으로 시작된다. `android/app/src/main/AndroidManifest.xml`의 `MainActivity`에 `android:exported="true"`가 있는지 한 번 확인해두면 좋다(Android 12+에서 intent-filter가 있는 액티비티에 필수. Capacitor 기본 템플릿엔 보통 이미 있지만, 이 환경엔 SDK가 없어 빌드로 직접 검증하지 못했다).

## 2. 릴리스 키스토어 생성

```bash
keytool -genkey -v -keystore gachimeokja-release.keystore -alias gachimeokja -keyalg RSA -keysize 2048 -validity 10000
```

안전한 곳에 백업(분실 시 같은 appId로 재출시 불가). SHA-256 지문 확인:

```bash
keytool -list -v -keystore gachimeokja-release.keystore -alias gachimeokja | grep SHA256
```

## 3. `assetlinks.json`에 실제 지문 채우기

`public/.well-known/assetlinks.json`의 `sha256_cert_fingerprints` 배열을 실제 값으로 교체:

- **업로드 키 지문** — 위 2번 명령으로 뽑은 값 (로컬 서명 테스트 빌드용)
- **Play App Signing 지문** — Play Console → 앱 선택 → 설정(Setup) → App integrity에서 확인. **신규 앱은 Play App Signing이 사실상 필수라, 실제 Play Store 배포 빌드의 App Links 검증은 이 지문 기준으로 이뤄진다.** 업로드 키 지문만 넣고 이걸 빠뜨리는 게 App Links가 "설치했는데도 브라우저로 열리는" 흔한 원인.

두 값을 배열에 같이 넣고 되면 웹 배포(Vercel)에 반영해 `https://www.eat-together.net/.well-known/assetlinks.json`에서 실제로 서빙되는지 확인.

검증 상태는 기기에서 확인 가능(최대 며칠 걸릴 수 있음):

```bash
adb shell pm get-app-links com.gachimeokja.app
```

## 4. Supabase Redirect URL 허용 목록에 추가

**Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**에 아래 한 줄 추가:

```
gachimeokja://oauth-callback
```

Google/Kakao 콘솔은 건드릴 필요 없음 — 두 프로바이더 모두 Supabase의 고정 콜백 URL(`https://<project>.supabase.co/auth/v1/callback`)을 향하고 있고, `redirectTo`는 Supabase가 자체적으로 허용 목록과 대조해 최종 리다이렉트하는 값이라 앱 쪽 등록만 있으면 된다.

## 5. Play Console

- 앱 등록, 패키지 ID `com.gachimeokja.app`
- Play App Signing 활성화(기본값)
- 스토어 등록정보용 아이콘/스크린샷 준비 (`resources/icon.png`가 1024×1024 소스, 스크린샷은 별도)
- 내부 테스트 트랙에 첫 AAB 업로드 → 실기기 설치 테스트 → 아래 6번 확인 후 단계적 출시

## 6. 확인해야 할 것 (실기기/에뮬레이터)

- Google/Kakao 로그인이 Chrome Custom Tab으로 열리고, 완료 후 앱으로 자연스럽게 돌아오는지
- 앱이 꺼진 상태에서 `/join/:code`, `/pot/:id` 링크를 탭했을 때(콜드 스타트) 앱이 해당 화면으로 바로 열리는지
- 앱이 이미 떠 있는 상태에서 같은 링크를 탭했을 때도 동일하게 동작하는지
- 하드웨어 뒤로가기가 각 주요 화면(특히 `/join/:code` 경유, 온보딩 리다이렉트 직후)에서 이상한 화면으로 튀거나 무한 리다이렉트 없이 자연스럽게 동작하는지, `/today`에서 뒤로가기 시 앱이 정상 종료되는지
- 앱 안에서 초대링크를 복사했을 때 `https://www.eat-together.net/...`로 나오는지 (`https://localhost/...`가 아닌지)
- `/reset-password` 링크는 여전히 일반 브라우저로 열리는지 (App Links를 `/join`, `/pot`로만 좁혀뒀기 때문에 의도된 동작)

## 후속 과제 (이번 범위 아님)

- **iOS** — 코드베이스는 그대로 재사용 가능. Universal Links 설정 + Apple 심사 대응이 별도로 필요.
- **네이티브 푸시(FCM)** — 지금 `src/lib/push.js`는 Web Push(VAPID)라 Capacitor WebView 안에서 백그라운드 전달이 불안정하다. `@capacitor/push-notifications` + Firebase 프로젝트(`google-services.json`) + 서버 발송 로직 변경이 필요한 별도 작업.
