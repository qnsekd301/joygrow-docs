# JoyGrow 설명서 최종 검수 기록

검수일: 2026-09-17

## 기준 소스

- JoyGrow 앱: `joygrow` 0.4.1의 실제 Next.js route와 컴포넌트
- 출석부 연동: `sunday-attendance` 2.71.0의 실제 React 화면과 JoyGrow bridge
- 과거 README보다 현재 실행 소스를 우선함

## 문서 결과

- GitBook Space: 1개 (`content.directory: .`)
- GitBook 페이지 섹션: 공식 가이드, 처음 시작하기, 주인공 사용법, 선생님 사용법, 관리자 사용법, 도움말, 문서 관리자용
- 목차 페이지: 42개
- 화면 인벤토리: 70개 항목
- Playwright 생성 이미지: 39개
- 캡처 건너뜀: 0개

## 2차 재디자인 반영

- 사용자 질문지의 공식 명칭, 목적, 문체, 용어와 문의 담당자를 반영함
- 학생은 `주인공`, 상점은 `포인트 상점`, 신앙 여정은 `믿음 원정대`로 설명함
- 실제 앱에 남아 있는 `열매상점`, `세계` 버튼은 화면 문구 그대로 병기함
- 선생님용 주일 운영 순서, 포인트·EXP 기준표, 주간 칭찬 제한을 전면 배치함
- 학부모 안내, 관리자 주간 체크리스트, 안전한 문의 양식을 추가함
- 답변이 비어 있는 정책은 추측하지 않고 현재 실행 코드가 보장하는 동작만 기록함

## 개인정보 보호

- JoyGrow 학생·독립 관리자 화면은 앱에 포함된 로컬 데모 모드로 촬영함
- 출석부 교사·통합 관리자 화면은 실제 React UI에 문서 전용 fixture를 연결해 촬영함
- 출석부 fixture 학생 이름은 `기쁨이`, `믿음이`, `소망이`, `사랑이`만 사용함
- 운영 DB, 운영 계정, 실제 비밀번호, API key, 환경변수와 실제 학생 연락처를 사용하지 않음
- `.env.docs`는 Git에서 제외함
- 답변 원본 `joygrow-manual-questionnaire.txt`는 공개 GitBook과 Git에서 제외함

## 자동 검수

`npm run docs:check`는 다음을 확인한다.

1. `SUMMARY.md`의 모든 Markdown 경로
2. `docs-inventory.md`의 모든 설명서 페이지 경로
3. Markdown의 모든 로컬 링크와 이미지
4. `capture-manifest.json`의 모든 캡처 파일
5. 최신 GitBook 공식 스키마에 대한 `gitbook-docs.yaml` 유효성
6. 모든 `content.directory`의 실제 존재 여부

## 재생성

```powershell
npm install
npx playwright install chromium
npm run docs:capture
npm run docs:check
```

기본 로컬 소스 경로는 Git에 포함되지 않는 `.env.docs`에 둔다. 다른 환경에서는 `.env.docs.example`을 복사해 두 앱의 소스 경로를 지정한다.
