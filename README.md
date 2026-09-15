# 본점 AI 학습회 · 1기 크루 모집

시카다 3301 스타일의 모집 사이트. 첫 화면에서 시험(AI에게 프롬프트를 넣어 HTML 파일을 만들게 하고, 그 파일에서 열쇠를 얻음)을 통과해야 명부 등록과 게시판에 들어갈 수 있음.

## 구조

```
public/          정적 프론트 (index.html, style.css, app.js) · 모바일 기준 레이아웃
api/             Vercel 서버리스 함수 (Node 22, ESM)
  _lib/repo.js   데이터 계층. Neon Postgres 구현 + 메모리 구현(DEV_MEM=1)
  _lib/http.js   JSON 응답, 권한 체크 유틸
  settings.js    GET  /api/settings          모집 상태 {closed}
  register.js    POST /api/register          {name, nick} → {crew, token}
  crew.js        GET  /api/crew              크루 목록 (닉네임만)
  posts.js       GET  /api/posts?board=free  게시글 / POST 글쓰기 (x-crew-token)
  admin/crew.js  GET  /api/admin/crew        실명 포함 명부 (x-admin-pass)
  admin/settings.js POST /api/admin/settings {closed} (x-admin-pass)
dev/server.js    로컬 개발 서버 (정적 + API, 메모리 저장)
dev/smoke.js     Playwright 전체 흐름 테스트
```

## 로컬 실행

```bash
npm install
npm run dev          # http://localhost:3000  (DB 없이 메모리 저장)
```

## 배포 (Vercel + Neon)

1. Neon 프로젝트 생성 후 연결 문자열 복사 (pooled 권장).
2. Vercel 프로젝트에 환경변수 등록
   - `DATABASE_URL` = Neon 연결 문자열
   - `ADMIN_PASS` = 담당자 화면 암호 (기본 7919)
3. 이 저장소를 Vercel에 연결하면 끝. 빌드 단계 없음. 테이블은 첫 API 호출 때 자동 생성됨.

## 화면 흐름

1. 관문: 편지 → "시험에 응하겠습니다" → 프롬프트 카드 → 열쇠 입력 → 입장하기
2. 등록: 이름 + 닉네임. 이름은 담당자만 봄. 닉네임 중복 불가. 같은 이름·닉네임이면 재입장.
3. 크루 카드: CREW #번호 + 닉네임. PNG 저장 가능.
4. 게시판: HOME / 공지(담당자만) / 자유 / 작품(링크) / 프롬프트(복사 버튼) / 크루
5. 담당자: `/#admin` → 암호 → 명부, CSV, 모집 마감, 공지 작성

## 열쇠

시험의 열쇠는 `VIBE`. 프롬프트 안에는 문자 코드 `[86, 73, 66, 69]`로만 들어 있음. 바꾸려면 `public/index.html`의 프롬프트와 `public/app.js`의 `KEY`를 함께 수정.
