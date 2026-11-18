# 학급 자리배치 앱 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 학급 명단·교실 배치·학생 쌍 조건을 브라우저에 저장하고, 교사 창(PC)과 발표 창(TV)으로 "랜덤처럼 보이지만 조건을 지키는" 자리 뽑기를 연출하는 정적 웹앱을 만든다.

**Architecture:** Next.js 정적 내보내기(`output: 'export'`) 앱. 배치 계산은 `src/lib/seating/`의 순수 함수로 분리해 단위 테스트로 검증한다. 데이터는 IndexedDB(`idb`)에 저장하고, 교사 창과 발표 창은 `BroadcastChannel`로만 통신한다. CSP 메타 태그로 외부 네트워크 요청을 원천 차단한다.

**Tech Stack:** Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind CSS 4, `idb`, Vitest + jsdom + @testing-library/react + fake-indexeddb, GitHub Actions → GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-17-seating-app-design.md`

## Global Constraints

- 프로젝트 루트: `E:\00 초등학교\11 바이브코딩\11 자리배치` (새 git 저장소, 기본 브랜치 `main`).
- Next.js 16은 학습 데이터와 다르다. 설정·API를 쓰기 전에 `node_modules/next/dist/docs/`를 확인한다 (static export: `01-app/02-guides/static-exports.md`, 폰트: `01-app/03-api-reference/02-components/font.md`).
- 서버 기능 금지: Route Handler, Server Action, middleware, 동적 라우트 사용하지 않는다.
- 외부 네트워크 요청 금지: 분석 도구·외부 CDN·외부 폰트 요청 없음. 폰트는 `next/font/google`(빌드 시 자체 호스팅)의 `Noto_Sans_KR`만 사용.
- 예시·테스트 데이터는 가짜 이름만 사용 (예: 가온, 나래, 다온, 라희, 마루, 바다, 사랑, 아라 …).
- UI 문구는 한국어. 교실 화면(발표 창, 한 화면 모드 교실 화면)에는 쌍 조건·위반 건수·조건 관련 문구를 절대 표시하지 않는다.
- 저장 형식과 백업 형식에 버전 번호 `SCHEMA_VERSION = 1`.
- 교사 화면 자동 잠금 기본값 5분, PIN은 4자리 숫자.
- GitHub Pages 하위 경로 대응: `basePath`는 환경 변수 `PAGES_BASE_PATH`(없으면 빈 문자열), `trailingSlash: true`.

## Review Focus

1. **학생 수와 자리 수 불일치** — 학생이 자리보다 많으면 배치 설정 저장과 뽑기를 막고 이유를 보여 줘야 한다. 학생이 적으면 남는 자리는 빈자리로 둔다. → Task 2 테스트
2. **동명이인** — 명단에 같은 이름이 있으면 경고하고, 화면에는 `이름(번호)`로 구분 표시한다. → Task 8 테스트
3. **학생 삭제** — 그 학생이 들어간 쌍 조건은 함께 지우고, 지난 기록에서는 "(삭제된 학생)"으로 보여 준다. → Task 4 테스트
4. **발표 창을 늦게 열거나 새로고침** — 발표 창이 `hello`를 보내면 교사 창이 현재 상태(대기 화면 또는 공개 결과)를 다시 보내야 한다. → Task 7 테스트
5. **조건 저장 뒤 배치 모드 변경** — 모둠 모드에서 저장한 조건이 짝 모드로 바꾸자 불가능해지면, 교사 창에만 이유가 보이고 발표 창은 대기 화면을 유지해야 한다. → Task 3, Task 10 테스트

---

## File Structure

```
src/
  app/
    layout.tsx              CSP 메타, 폰트, 전역 스타일
    globals.css
    page.tsx                한 화면 모드 교실 화면 (앱 시작점)
    teacher/page.tsx        교사 창 (PIN 잠금)
    present/page.tsx        발표 창 (TV)
  lib/
    seating/
      types.ts              Student, Layout, Unit, PairConstraint, Assignment 등
      layout.ts             배치 설정 → Unit[] 변환, 검증
      constraints.ts        모드별 유효 조건, 조건 검증
      solver.ts             generateSeating
      rng.ts                시드 난수
    roster.ts               붙여넣기 명단 파싱, 표시 이름
    db/
      db.ts                 IndexedDB 열기 (idb)
      repo.ts               학급·기록·설정 저장소
      backup.ts             내보내기/가져오기
    auth/pin.ts             PIN 해시·검증
    channel.ts              교사 창 ↔ 발표 창 메시지
  hooks/
    useIdleLock.ts
  components/
    reveal/RevealStage.tsx  A/B/C 연출 (교실 화면 공용)
    reveal/useReveal.ts     연출 진행 상태
    teacher/RosterEditor.tsx
    teacher/LayoutEditor.tsx
    teacher/ConstraintEditor.tsx
    teacher/DrawPanel.tsx
    teacher/HistoryPanel.tsx
    teacher/BackupPanel.tsx
    PinGate.tsx
    SeatingChart.tsx        좌석표 (인쇄 겸용)
tests/                      src 구조를 따라 *.test.ts(x)
scripts/check-out.mjs       빌드 결과 외부 URL 로드 검사
.github/workflows/deploy.yml
```

---

### Task 1: 프로젝트 뼈대

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `postcss.config.mjs`, `.gitignore`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`(임시), `tests/smoke.test.ts`, `scripts/check-out.mjs`

**Interfaces:**
- Produces: `npm run dev | build | test | check:out` 스크립트, `@/` → `src/` 경로 별칭

- [ ] **Step 1:** `git init -b main`, Next 16.4.3 / React 19.3.0 / Tailwind 4 / TypeScript 5 / `idb` / devDeps `vitest jsdom @testing-library/react @testing-library/jest-dom fake-indexeddb @vitejs/plugin-react` 설치. `.gitignore`에 `node_modules .next out .superpowers` 추가.
- [ ] **Step 2:** `next.config.ts` — `output: 'export'`, `trailingSlash: true`, `basePath: process.env.PAGES_BASE_PATH ?? ''`, `images: { unoptimized: true }`.
- [ ] **Step 3:** `layout.tsx` — `<html lang="ko">`, `Noto_Sans_KR`, `<head>`에 CSP 메타:
  `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'`
- [ ] **Step 4:** `tests/smoke.test.ts` — `expect(1 + 1).toBe(2)`; `vitest.config.ts`는 jsdom 환경, `@` 별칭, setup에서 `@testing-library/jest-dom`과 `fake-indexeddb/auto` 로드.
- [ ] **Step 5:** `scripts/check-out.mjs` — `out/**/*.html`에서 `src=`/`href=`가 `http://` 또는 `https://`로 시작하는 태그를 찾으면 파일·줄을 출력하고 exit 1. `npm run check:out` = `next build && node scripts/check-out.mjs`.
- [ ] **Step 6:** Run `npm test` → PASS, `npm run check:out` → 빌드 성공 + "외부 리소스 없음".
- [ ] **Step 7:** Commit `chore: scaffold static Next.js app with CSP and tests`

---

### Task 2: 배치 설정 → 자리 단위(Unit)

**Files:**
- Create: `src/lib/seating/types.ts`, `src/lib/seating/layout.ts`, `src/lib/seating/rng.ts`, `src/lib/roster.ts`(`displayName`만)
- Test: `tests/lib/seating/layout.test.ts`

**Interfaces:**
- Produces:
```ts
type Gender = 'M' | 'F' | null;
interface Student { id: string; number: number; name: string; gender: Gender }
type LayoutMode = 'pair' | 'group';
interface Layout { mode: LayoutMode; rows: number; cols: number; groupSize: 4 | 6; disabledSeats: SeatId[] }
type SeatId = string;               // 'u{row}-{col}-s{index}'
interface Unit { id: string; row: number; col: number; seats: SeatId[] }  // 사용 가능한 자리만
type Assignment = Record<SeatId, string | null>;   // seatId → studentId
function buildUnits(layout: Layout): Unit[];       // 짝 모드: 자리 2개, 모둠 모드: groupSize개
function seatCount(layout: Layout): number;
function validateLayout(layout: Layout, studentCount: number): string[]; // 빈 배열 = OK
function createRng(seed: number): () => number;    // mulberry32, [0,1)
// src/lib/roster.ts
function displayName(s: Student, all: Student[]): string;   // 동명이인이면 '가온(3)', 아니면 '가온'
```

- [ ] **Step 1: 실패 테스트 작성**
  - `buildUnits({mode:'pair',rows:2,cols:3,...})` → 6개 unit, 각 seats 길이 2, id `'u0-0'` 형태
  - `mode:'group', groupSize:6, rows:2, cols:2` → 4개 unit, 각 6자리
  - `disabledSeats:['u0-0-s1']` → 해당 unit seats 길이 1, 모든 자리가 꺼진 unit은 제외
  - `validateLayout(pair 2×2 = 8자리, 9)` → `['자리가 1개 부족해요 (학생 9명, 자리 8개)']`
  - `validateLayout(..., 7)` → `[]` (남는 자리는 빈자리)
  - `createRng(1)`을 두 번 만들면 같은 수열
  - **Review Focus 2:** `displayName` 동명이인(번호 3) → `'가온(3)'`, 아닐 때 `'가온'`
- [ ] **Step 2:** `npx vitest run tests/lib/seating/layout.test.ts` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5:** Commit `feat(seating): layout units and validation`

---

### Task 3: 쌍 조건 해석과 검증

**Files:**
- Create: `src/lib/seating/constraints.ts`
- Modify: `src/lib/seating/types.ts` (타입 추가)
- Test: `tests/lib/seating/constraints.test.ts`

**Interfaces:**
- Consumes: Task 2 타입
- Produces:
```ts
type ConstraintKind = 'avoid-pair' | 'avoid-group' | 'must-pair' | 'must-group';
interface PairConstraint { id: string; a: string; b: string; kind: ConstraintKind } // a,b = studentId
interface EffectiveConstraints { together: [string, string][]; apart: [string, string][] }
function effectiveConstraints(cs: PairConstraint[], mode: LayoutMode): EffectiveConstraints;
function validateConstraints(students: Student[], cs: PairConstraint[], layout: Layout): string[];
function canAddConstraint(cs: PairConstraint[], next: Omit<PairConstraint,'id'>): string | null; // null = 추가 가능
```
- 모드별 의미 (스펙 5.3): pair → apart = avoid-pair ∪ avoid-group, together = must-pair. group → apart = avoid-group, together = must-pair ∪ must-group.

- [ ] **Step 1: 실패 테스트 작성**
  - `effectiveConstraints([avoid-pair A-B], 'group').apart` → `[]`; `'pair'` → `[[A,B]]`
  - `effectiveConstraints([must-group A-B], 'pair').together` → `[]`
  - `canAddConstraint([must-pair A-B], {a:A,b:C,kind:'must-pair'})` → `'이미 반드시 짝인 친구가 있는 학생이에요'`
  - 같은 두 학생에 조건 중복 → `'이미 조건이 있는 두 학생이에요'`; `a === b` → `'서로 다른 두 학생을 골라 주세요'`
  - `validateConstraints`: must-pair A-B + must-group B-C + avoid-group A-C, group 모드 → 메시지 1개 이상, 메시지에 세 학생 이름 포함
  - group 모드 groupSize 4에서 must-group으로 5명이 한 무리 → `'함께 앉아야 하는 학생 5명이 모둠 인원(4명)보다 많아요'`
  - **Review Focus 5:** 위 must-group 3명 무리는 group 4에서 OK, 같은 조건을 pair 모드 layout으로 검증하면 must-pair 무리 크기 기준으로 다시 판정 (must-group은 무시되어 `[]`)
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현 — union-find로 together 무리를 만들고, 무리 안 apart 쌍과 무리 크기 > 단위 최대 자리 수를 보고. 메시지의 학생 이름은 `displayName`.
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(seating): pair constraint semantics and validation`

---

### Task 4: 배치 계산기 (solver)

**Files:**
- Create: `src/lib/seating/solver.ts`
- Test: `tests/lib/seating/solver.test.ts`

**Interfaces:**
- Consumes: Task 2·3
- Produces:
```ts
interface SolveInput { students: Student[]; layout: Layout; constraints: PairConstraint[]; genderRule: boolean; rng: () => number }
type SolveResult = { ok: true; assignment: Assignment; violations: 0 } | { ok: false; reasons: string[] };
function generateSeating(input: SolveInput): SolveResult;
function findViolations(assignment: Assignment, layout: Layout, cs: PairConstraint[]): PairConstraint[]; // 교사 창 점검·수동 교체 경고용
```

알고리즘 (테스트가 결정하지 않는 부분):
```
1. validateLayout / validateConstraints 문제가 있으면 { ok:false, reasons }.
2. together 무리를 덩어리로 만든다. 덩어리를 무작위 순서로 섞고 큰 덩어리부터 배치.
3. 무작위 백트래킹: 덩어리마다 무작위 순서의 unit을 시도, 남은 자리 >= 덩어리 크기이고
   그 unit에 이미 있는 학생과 apart 쌍이 없으면 넣는다. 막히면 되돌아간다.
   전체 시도 노드 수 20000 넘으면 처음부터 다시 섞어 재시도, 최대 50회. 모두 실패 → ok:false,
   reasons: ['조건을 모두 지키는 배치를 찾지 못했어요. 조건이나 배치 설정을 확인해 주세요.'].
4. unit 안에서는 자리 순서를 무작위로 섞는다 (빈자리 위치도 무작위).
5. genderRule이면 1~4를 반복해 유효 해 60개를 모으고 점수가 최대인 해들 중 무작위 하나를 고른다.
   pair 점수 = 남녀 짝 수, group 점수 = -Σ|남-여| (성별 null은 셈에서 제외).
```

- [ ] **Step 1: 실패 테스트 작성** (모든 테스트는 `createRng(seed)` 사용, 학생 16명 가짜 이름)
  - 조건 없음 → `ok:true`, 모든 학생이 정확히 한 번 배정, 배정된 자리는 전부 `buildUnits` 자리
  - 1,000번(seed 1..1000) 생성, avoid-pair 3쌍 + must-pair 2쌍 → `findViolations` 항상 `[]`
  - must-pair A-B를 1,000번 생성 → A가 앉은 unit 종류가 전체 unit 수의 80% 이상 (매번 다른 자리)
  - 조건 없이 2,000번 → 학생 X의 unit별 빈도가 기댓값의 ±35% 안 (치우침 없음)
  - 학생 4명이 서로 전부 avoid-group, group 모드 3모둠 → `ok:false`
  - **Review Focus 1:** 학생 9명, 자리 8개 → `ok:false`, reasons에 `'자리가 1개 부족해요'` 포함
  - genderRule, 남 8 여 8, pair 4×2 → 남녀 짝 8쌍; 같은 입력 seed 1..50에서 결과 배정이 50개 모두 같지는 않음
  - genderRule, group 4인 4모둠, 남 8 여 8 → 모든 모둠 남2 여2
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS (전체 파일 10초 이내)
- [ ] **Step 5:** Commit `feat(seating): randomized constraint solver`

---

### Task 5: IndexedDB 저장소와 백업

**Files:**
- Create: `src/lib/db/db.ts`, `src/lib/db/repo.ts`, `src/lib/db/backup.ts`
- Test: `tests/lib/db/repo.test.ts`, `tests/lib/db/backup.test.ts`

**Interfaces:**
- Consumes: Task 2·3 타입
- Produces:
```ts
const SCHEMA_VERSION = 1;
type RevealStyle = 'A' | 'B' | 'C';
interface ClassRecord { id: string; name: string; students: Student[]; layout: Layout; constraints: PairConstraint[]; genderRule: boolean; lastRevealStyle: RevealStyle; createdAt: string }
interface SeatingRecord { id: string; classId: string; createdAt: string; layout: Layout; assignment: Assignment; studentNames: Record<string, string> } // 확정 당시 이름 스냅숏
interface AppSettings { pinHash: string | null; pinSalt: string | null; activeClassId: string | null; idleMinutes: number } // 기본 idleMinutes 5
// repo.ts
listClasses(): Promise<ClassRecord[]>; getClass(id): Promise<ClassRecord | undefined>;
saveClass(c: ClassRecord): Promise<void>; deleteClass(id): Promise<void>;          // 기록도 삭제
removeStudent(classId: string, studentId: string): Promise<ClassRecord>;           // 관련 조건 제거
addSeatingRecord(r: SeatingRecord): Promise<void>; listSeatingRecords(classId): Promise<SeatingRecord[]>; // 최신순
deleteSeatingRecord(id): Promise<void>;
getSettings(): Promise<AppSettings>; saveSettings(s: Partial<AppSettings>): Promise<void>;
wipeAll(): Promise<void>;
// backup.ts
interface BackupFile { format: 'seating-app-backup'; version: number; exportedAt: string; classes: ClassRecord[]; records: SeatingRecord[] }
exportBackup(classIds?: string[]): Promise<BackupFile>;   // PIN 설정은 포함하지 않음
parseBackup(json: string): { ok: true; data: BackupFile } | { ok: false; error: string };
importBackup(data: BackupFile, mode: 'overwrite' | 'add-new'): Promise<void>; // add-new: 학급·기록 id 새로 발급
```
- DB 이름 `seating-app`, 스토어 `classes`, `records`(index `classId`), `settings`(키 `'app'`).

- [ ] **Step 1: 실패 테스트 작성** (`fake-indexeddb`, 각 테스트 전 `wipeAll`)
  - saveClass → getClass 동일 객체; deleteClass 시 해당 기록도 사라짐
  - **Review Focus 3:** `removeStudent` 후 그 학생이 들어간 constraints 없음; 기존 SeatingRecord의 `studentNames`에는 이름이 남아 있음
  - listSeatingRecords 최신순
  - getSettings 기본값 `{pinHash:null, pinSalt:null, activeClassId:null, idleMinutes:5}`
  - exportBackup 결과에 `pinHash` 문자열이 없음
  - parseBackup: 잘못된 JSON → `ok:false, error:'백업 파일을 읽을 수 없어요'`; `version: 2` → `ok:false, error:'더 새로운 버전의 앱에서 만든 백업이에요'`
  - importBackup add-new → 학급 수 2배, id 모두 다름; overwrite → 학급 수 동일, 내용 교체
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현 (`idb`의 `openDB`, `crypto.randomUUID()`로 id)
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(db): IndexedDB repository and backup`

---

### Task 6: PIN 잠금

**Files:**
- Create: `src/lib/auth/pin.ts`, `src/hooks/useIdleLock.ts`, `src/components/PinGate.tsx`
- Test: `tests/lib/auth/pin.test.ts`, `tests/components/PinGate.test.tsx`

**Interfaces:**
- Consumes: Task 5 `getSettings/saveSettings`
- Produces:
```ts
isValidPin(pin: string): boolean;                       // /^\d{4}$/
hashPin(pin: string, salt: string): Promise<string>;    // SHA-256(salt + pin) hex, crypto.subtle
newSalt(): string;
verifyPin(pin: string, settings: AppSettings): Promise<boolean>;
useIdleLock(opts: { minutes: number; enabled: boolean; onLock: () => void }): void; // mousemove/keydown/pointerdown 리셋
<PinGate onUnlock={() => void} warnOnScreen?: boolean>  // PIN 미설정이면 "PIN 정하기"(2회 입력) 화면
```
- 잠금 해제 상태는 메모리(React state)에만 둔다. 새로고침하면 다시 잠긴다.
- PinGate 문구: 입력 칸은 `type="password"` + `inputMode="numeric"`; 아래에 "이 잠금은 학생이 지나가다 보는 것을 막는 용도예요." 안내; "PIN을 잊었어요" → "모든 데이터를 지우고 새로 시작" 확인 후 `wipeAll`.
- `warnOnScreen`이면 입력 전에 "지금 화면이 TV에 보일 수 있어요. 계속할까요?" 확인 단계.

- [ ] **Step 1: 실패 테스트 작성**
  - `isValidPin('1234')` true, `'123'`·`'12a4'` false
  - 같은 pin·salt → 같은 해시, 다른 salt → 다른 해시
  - PinGate: PIN 미설정 → 두 번 다른 값 입력 시 "두 PIN이 달라요" 표시; 같은 값이면 저장 후 onUnlock 호출
  - PinGate: 틀린 PIN → "PIN이 맞지 않아요", onUnlock 미호출
  - useIdleLock: fake timers로 5분 경과 → onLock 1회; 4분 59초에 키 입력 후 다시 4분 → 미호출
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(auth): PIN gate and idle lock`

---

### Task 7: 교사 창 ↔ 발표 창 채널

**Files:**
- Create: `src/lib/channel.ts`
- Test: `tests/lib/channel.test.ts`

**Interfaces:**
- Consumes: Task 2 타입·`displayName`, Task 5 `ClassRecord`, `RevealStyle`
- Produces:
```ts
interface SeatView { seatId: SeatId; name: string | null }          // 이름만. 조건 정보는 타입에 없음
interface UnitView { id: string; row: number; col: number; seats: SeatView[] }
interface StageView { className: string; mode: LayoutMode; rows: number; cols: number; units: UnitView[] }
type IdleView = { kind: 'title'; className: string; date: string } | { kind: 'chart'; stage: StageView };
type ToPresenter =
  | { type: 'idle'; view: IdleView }
  | { type: 'reveal'; revealId: string; style: RevealStyle; stage: StageView; speed: 1 | 2 | 3 }
  | { type: 'control'; revealId: string; action: 'skip-all' | 'flip'; seatId?: SeatId }
  | { type: 'speed'; revealId: string; speed: 1 | 2 | 3 };
type ToTeacher = { type: 'hello' } | { type: 'flipped'; revealId: string; seatId: SeatId } | { type: 'done'; revealId: string };
function openTeacherChannel(onMessage: (m: ToTeacher) => void): { send(m: ToPresenter): void; close(): void };
function openPresenterChannel(onMessage: (m: ToPresenter) => void): { send(m: ToTeacher): void; close(): void };
function toStageView(cls: ClassRecord, assignment: Assignment): StageView;   // 동명이인은 displayName 사용
```
- 채널 이름 `'seating-app'`.

- [ ] **Step 1: 실패 테스트 작성** (jsdom에 BroadcastChannel이 없으면 테스트 setup에서 메모리 폴리필)
  - 교사가 보낸 `reveal` → 발표자 콜백이 같은 객체 수신
  - **Review Focus 4:** 발표자가 `hello` 전송 → 교사 콜백이 `{type:'hello'}` 수신 (재전송 로직은 Task 10에서 테스트)
  - `toStageView` 결과를 `JSON.stringify` 했을 때 `constraints`, `avoid`, `must` 문자열이 없음
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat: teacher-presenter BroadcastChannel protocol`

---

### Task 8: 명단 편집과 배치 설정 화면

**Files:**
- Create: `src/lib/roster.ts`, `src/components/teacher/RosterEditor.tsx`, `src/components/teacher/LayoutEditor.tsx`, `src/components/SeatingChart.tsx`
- Test: `tests/lib/roster.test.ts`, `tests/components/LayoutEditor.test.tsx`

**Interfaces:**
- Consumes: Task 2, Task 5
- Produces:
```ts
parseRosterText(text: string): { rows: { number: number; name: string; gender: Gender }[]; errors: string[] }; // roster.ts에 추가
<RosterEditor cls={ClassRecord} onChange={(c: ClassRecord) => void} />
<LayoutEditor cls={ClassRecord} onChange={(c: ClassRecord) => void} />
<SeatingChart stage={StageView} orientation?: 'front' | 'teacher' size?: 'tv' | 'print' | 'small' onSeatClick?: (seatId) => void selectedSeat?: SeatId highlightSeats?: SeatId[] />
```
- 붙여넣기: 탭/쉼표 구분, 첫 줄이 '번호'·'이름'을 포함하면 헤더로 건너뜀, 열 1개면 이름만(번호 자동 부여), 성별 값 `남|남자|M|m → 'M'`, `여|여자|F|f → 'F'`, 그 외/빈칸 → null.
- RosterEditor: 표(번호·이름·성별 편집, 삭제), "붙여넣기로 추가", 동명이인 경고 배너. 삭제는 확인 후 `removeStudent`.
- LayoutEditor: 모드 선택, 줄·분단(1~10), 모둠 인원(4/6), `SeatingChart`에서 자리 클릭으로 끄기/켜기, `validateLayout` 메시지 표시, 문제 있으면 저장 버튼 대신 메시지.
- SeatingChart: `orientation='teacher'`는 행·열을 뒤집어 그리고 칠판을 아래에 표시.

- [ ] **Step 1: 실패 테스트 작성**
  - `parseRosterText('번호\t이름\t성별\n1\t가온\t남\n2\t나래\t여자')` → 2행, gender `'M'`,`'F'`
  - `parseRosterText('가온\n나래')` → number 1,2
  - **Review Focus 2:** RosterEditor에 같은 이름 2명 → "같은 이름의 학생이 있어요" 표시
  - LayoutEditor: 학생 9명, 2×2 짝 → "자리가 1개 부족해요" 보이고 저장 버튼 없음
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(teacher): roster and layout editors`

---

### Task 9: 쌍 조건 편집 화면

**Files:**
- Create: `src/components/teacher/ConstraintEditor.tsx`
- Test: `tests/components/ConstraintEditor.test.tsx`

**Interfaces:**
- Consumes: Task 3 `canAddConstraint`, `validateConstraints`; Task 8 `displayName`
- Produces: `<ConstraintEditor cls={ClassRecord} onChange={(c: ClassRecord) => void} />`
- 학생 두 명 선택 + 종류 선택(🚫 짝 금지 / 🚫 모둠 금지 / 🤝 반드시 짝 / 🤝 반드시 같은 모둠) → 추가. `canAddConstraint`가 비null이면 그 메시지를 보여 주고 추가하지 않음.
- 목록은 종류별로 묶어 표시, 삭제 가능. 하단에 현재 배치 모드 기준 `validateConstraints` 결과("현재 설정으로 배치할 수 있어요" 또는 문제 목록).
- 스펙 5.3 표를 그대로 도움말로 보여 준다.

- [ ] **Step 1: 실패 테스트 작성**
  - A-B 반드시 짝 추가 후 A-C 반드시 짝 시도 → 메시지 표시, 목록 1개 유지
  - 충돌 조합 추가 → 하단에 문제 메시지
  - 정상 → "현재 설정으로 배치할 수 있어요"
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(teacher): pair constraint editor`

---

### Task 10: 공개 연출과 발표 창

**Files:**
- Create: `src/components/reveal/useReveal.ts`, `src/components/reveal/RevealStage.tsx`, `src/app/present/page.tsx`
- Test: `tests/components/RevealStage.test.tsx`, `tests/app/present.test.tsx`

**Interfaces:**
- Consumes: Task 7 (`StageView`, 채널), Task 8 `SeatingChart`
- Produces:
```ts
useReveal(opts: { stage: StageView; style: RevealStyle; speed: 1|2|3; onDone: () => void }): {
  shown: Record<SeatId, string | null | undefined>;   // undefined = 아직 숨김(또는 섞이는 중)
  rolling: string | null;                             // B 방식 큰 글씨
  skipAll(): void; flip(seatId: SeatId): void; done: boolean;
}
<RevealStage stage style speed onDone size?: 'tv' | 'small' onFlip?={(seatId) => void} controlRef?: React.Ref<{ skipAll(): void; flip(seatId: SeatId): void }> />
```
- 연출 (스펙 5.5): A = 이름 섞임 2.5초 후 전체 멈춤 / B = 자리 순서대로 룰렛 후 착석, 한 명당 speed 1:1.2초, 2:0.7초, 3:0.35초 / C = 모든 자리 카드, `flip`으로 하나씩, 클릭·터치로도 뒤집힘(발표 창에서 유일한 조작).
- 섞이는 동안 보여 주는 이름은 `stage`에 있는 이름들 중 무작위. 최종 결과는 `stage` 그대로.
- 발표 창 `/present`: 시작 시 `hello` 전송, `idle`이면 제목(학급 이름·날짜, 큰 글씨) 또는 좌석표, `reveal`이면 RevealStage, `control`/`speed` 반영, 끝나면 `done` 전송. 버튼·메뉴 없음. 첫 클릭 시 `document.documentElement.requestFullscreen()` 시도, 전체 화면이 아니면 화면 구석에 작은 "클릭하면 전체 화면" 안내.

- [ ] **Step 1: 실패 테스트 작성** (fake timers)
  - A: 시작 직후 shown 값 일부가 최종과 다를 수 있음, 2.5초 뒤 shown이 stage 이름과 완전히 일치하고 onDone 1회
  - B speed 3, 4명 → 1.4초 뒤 완료; 도중 `skipAll` → 즉시 전체 일치
  - C: 처음 전부 undefined, `flip(s)` 후 해당 자리만 이름, 모두 뒤집으면 onDone
  - 발표 창: 마운트 시 `hello` 전송; `reveal` 수신 → 학생 이름 렌더; 렌더된 DOM에 `button` 요소 0개
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현 (TV용 큰 글씨: 자리 이름 최소 `2rem`)
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(reveal): reveal styles and presenter window`

---

### Task 11: 교사 창 (뽑기·기록·백업)

**Files:**
- Create: `src/components/teacher/DrawPanel.tsx`, `src/components/teacher/HistoryPanel.tsx`, `src/components/teacher/BackupPanel.tsx`, `src/app/teacher/page.tsx`
- Test: `tests/components/DrawPanel.test.tsx`, `tests/components/HistoryPanel.test.tsx`

**Interfaces:**
- Consumes: Task 4 `generateSeating`, `findViolations`; Task 5 repo/backup; Task 6 `PinGate`, `useIdleLock`; Task 7 채널; Task 8·9 편집기; Task 10 `RevealStage`
- Produces: `<DrawPanel cls={ClassRecord} channel={TeacherChannel} />`, `openPresenterWindow(): Promise<Window | null>`
- `/teacher`: PinGate(`warnOnScreen=false`) → 학급 선택/새 학급, 탭 [뽑기 · 명단 · 배치 · 쌍 조건 · 기록 · 백업/설정]. `useIdleLock(idleMinutes)` → 잠금. 처음 실행(학급 없음) 시 "새 학급 만들기"로 시작.
- `openPresenterWindow`: `window.getScreenDetails`가 있으면 권한 요청 후 두 번째 화면 좌표로 `window.open(basePath+'/present/', 'seating-present', 'left=..,top=..,width=..,height=..')`; 없거나 거부되면 그냥 새 창. 반환값 null(팝업 차단)이면 "팝업이 차단됐어요. 주소창 오른쪽에서 허용해 주세요" 표시.
- DrawPanel 흐름:
  1. 연출 방식 A/B/C 선택(마지막 선택 기억 → `lastRevealStyle` 저장), 속도(B만), "발표 창 열기"
  2. "뽑기 시작" → `generateSeating`; 실패면 이유 목록만 교사 창에 표시하고 발표 창에는 아무것도 보내지 않음
  3. 성공 → 발표 창에 `reveal` 전송, 교사 창에는 작은 미리보기(같은 RevealStage, `size='small'`)와 "조건 위반 0건" 표시, 버튼 [나머지 바로 공개] [속도] (C면 미리보기 카드 클릭으로 `control:flip`)
  4. 완료 후 [다시 뽑기] [이대로 확정]. 확정 → `addSeatingRecord`, 발표 창에 `idle: chart` 전송
  5. 확정 전후 모두 좌석표에서 두 자리를 차례로 누르면 교환; 교환 후 `findViolations`가 비어 있지 않으면 "⚠ 가온·나래: 짝 금지 조건과 겹쳐요" 경고 (막지 않음)
  6. `hello` 수신 시 현재 상태(진행 중 reveal 또는 마지막 idle)를 다시 전송
  7. "대기 화면" 선택: [학급 이름] / [마지막 확정 좌석표] → 즉시 `idle` 전송
- HistoryPanel: 최신순 목록, 열기(좌석표, `studentNames` 사용, 삭제된 학생은 "(삭제된 학생)"), 삭제, 인쇄(`orientation` 선택 후 `window.print()`; `@media print`로 좌석표만 출력).
- BackupPanel: 전체/현재 학급 내보내기(파일명 `자리배치-백업-YYYY-MM-DD.json`, "학생 정보가 들어 있으니 안전하게 보관하세요"), 가져오기(같은 학급 있으면 덮어쓰기/새로 추가 선택), PIN 변경, 자동 잠금 시간, 모든 데이터 지우기.

- [ ] **Step 1: 실패 테스트 작성** (가짜 채널 객체 주입)
  - **Review Focus 5:** 짝 모드에서 불가능한 조건 → "뽑기 시작" 후 이유 표시, 가짜 채널 `send` 호출 0회
  - 정상 → `send`가 `type:'reveal'`로 1회, 메시지에 조건 관련 키 없음
  - **Review Focus 4:** reveal 진행 중 `hello` 수신 → 같은 `revealId`의 `reveal` 재전송
  - 확정 → `listSeatingRecords` 1건, `send`가 `idle`/`chart`
  - 자리 교환으로 avoid-pair 쌍이 붙으면 경고 문구 표시
  - HistoryPanel: 삭제된 학생 id → "(삭제된 학생)"
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(teacher): draw panel, history, backup, teacher window`

---

### Task 12: 한 화면 모드 교실 화면 (시작 화면)

**Files:**
- Modify: `src/app/page.tsx`
- Test: `tests/app/home.test.tsx`

**Interfaces:**
- Consumes: Task 4, 5, 6, 8, 10
- `/` 구성: 활성 학급 이름(큰 글씨), [자리 뽑기] [좌석표 보기] [교사 화면] 버튼. 학급이 없으면 "교사 화면에서 학급을 먼저 만들어 주세요"와 [교사 화면] 버튼만.
- [자리 뽑기] → 방식 A/B/C 선택 → `generateSeating` → 실패면 "설정을 확인해 주세요"만 표시(이유 숨김) → 성공이면 화면 가득 RevealStage → 끝나면 [다시 뽑기](PIN 없음) [확정](PinGate `warnOnScreen`) .
- [교사 화면] → `/teacher/`로 이동 (PinGate는 `warnOnScreen=true`가 되도록 쿼리 `?from=classroom` 전달 → teacher 페이지가 읽어 경고 단계 표시).
- 이 화면에는 쌍 조건·위반 관련 문구를 두지 않는다.

- [ ] **Step 1: 실패 테스트 작성**
  - 불가능한 조건 → "설정을 확인해 주세요"만 보이고 이유 문구(학생 이름 포함 메시지) 없음
  - 정상 뽑기 완료 후 [확정] → PIN 입력 화면 표시, 바른 PIN 후 기록 1건
  - 렌더된 텍스트에 "금지", "반드시", "조건 위반" 없음
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat: single-screen classroom home`

---

### Task 13: GitHub Pages 배포와 마무리 검증

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`
- Modify: `src/app/teacher/page.tsx`(필요 시 마지막 수정만)

- [ ] **Step 1:** `deploy.yml` — `push: main` + `workflow_dispatch`; jobs: checkout → setup-node 24 → `npm ci` → `actions/configure-pages`(id `pages`) → `PAGES_BASE_PATH=${{ steps.pages.outputs.base_path }} npm run build` → `node scripts/check-out.mjs` → `actions/upload-pages-artifact`(path `out`) → `actions/deploy-pages`. permissions `pages: write, id-token: write, contents: read`.
- [ ] **Step 2:** `README.md` — 선생님용 사용법(한국어): 처음 시작(PIN·학급), 명단 붙여넣기, 배치, 쌍 조건, 두 화면으로 뽑기(발표 창을 TV로 옮기고 전체 화면), 한 화면 모드, 백업. "모든 데이터는 이 브라우저에만 저장돼요" 명시. 배포 방법(GitHub 저장소 Settings → Pages → Source: GitHub Actions).
- [ ] **Step 3:** Run `npm test` → 전체 PASS; `npm run check:out` → 성공.
- [ ] **Step 4:** 실제 브라우저 확인: `npx serve out` 또는 `next dev`로 띄워 교사 창에서 학급 만들기 → 명단 붙여넣기(가짜 이름 20명) → 짝 금지 2쌍·반드시 짝 1쌍 → 발표 창 열기 → A/B/C 각각 뽑기·확정 → 기록·인쇄 미리보기 → 백업 내보내기/가져오기. 네트워크 탭에서 자기 주소 외 요청 0건 확인. 발표 창 화면에 조건 문구 없음 확인.
- [ ] **Step 5:** Commit `chore: GitHub Pages deploy workflow and README`
