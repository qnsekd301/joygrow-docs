# 문서 화면 다시 캡처하기

문서 관리자는 Playwright 자동화를 이용해 실제 JoyGrow 화면 이미지를 갱신할 수 있습니다.

## 처음 한 번 준비하세요

1. 이 저장소에서 `npm install`을 실행합니다.
2. `npx playwright install chromium`을 실행합니다.
3. `.env.docs.example`을 `.env.docs`로 복사해 `JOYGROW_SOURCE_DIR`을 설정합니다.

## 이렇게 실행하세요

```powershell
npm run docs:capture
npm run docs:check
```

결과 이미지는 `images/student`, `images/teacher`, `images/admin`에 저장됩니다. 성공 목록과 건너뛴 사유는 `images/capture-manifest.json`에서 확인합니다.

> 기억하세요  
> 운영 계정의 비밀번호나 환경변수를 Git에 저장하지 마세요. 교사 화면은 문서 촬영 전용 DEMO 계정을 사용하세요.
