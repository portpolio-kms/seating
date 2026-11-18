# 교우관계 분석 (2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1단계 자리배치 앱의 교사 화면에 "교우관계" 탭을 더한다. 설문 스크립트 생성, CSV 업로드, 관심 학생 레이더와 쌍 조건 추천, 관계망 그래프, 교사용·학부모용 상담 카드가 들어간다.

**Architecture:** 설문 해석·분석·학부모 보기 가공은 `src/lib/survey/`의 순수 함수로 만들고 단위 테스트로 검증한다. 설문 결과는 IndexedDB 새 스토어 `surveys`에 학급별로 저장한다(DB 버전 2, 백업 형식 버전 2, 버전 1 호환). 화면은 `src/components/relations/`에 두고, 교사 페이지의 새 탭에서만 렌더링한다. vis-network는 그래프 컴포넌트에서만 동적 import 한다.

**Tech Stack:** 기존(Next.js 16 static export, React 19, TypeScript, Tailwind 4, idb, Vitest + jsdom + RTL + fake-indexeddb) + `vis-network`(npm, 번들). CSV 파서는 직접 작성(의존성 없음).

**Spec:** `docs/superpowers/specs/2026-11-18-relationship-analysis-design.md` (선행: `docs/superpowers/specs/2026-11-17-seating-app-design.md`)

## Global Constraints

- 작업 브랜치 `feat/phase2-relations` (main에서 분기). main 직접 커밋 금지.
- 커밋 메시지 끝: 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. 커밋 작성자는 저장소 설정(portpolio-kms) 그대로.
- Next.js 16은 학습 데이터와 다르다. API를 쓰기 전에 `node_modules/next/dist/docs/` 확인.
- 서버 기능 금지(Route Handler, Server Action, middleware, 동적 라우트). 외부 네트워크 요청 금지. CSP(`src/app/layout.tsx`)를 느슨하게 바꾸지 않는다.
- 예시·테스트 데이터는 가짜 이름만 (가온, 나래, 다온, 라희, 마루, 바다, 사랑, 아라 …; 성 포함 이름이 필요하면 김가온, 이나래 등).
- 교우관계 데이터(점수, 지목, 응답 원문, 레이더, 추천)는 교사 페이지(`/teacher`)에서만 렌더링한다. `src/app/page.tsx`, `src/app/present/page.tsx`, `src/lib/channel.ts`의 메시지 타입은 건드리지 않는다.
- 학부모 보기 출력에는 다른 학생 이름이 절대 들어가지 않는다.
- UI 문구는 한국어.
- `SCHEMA_VERSION = 2`. 버전 1 백업과 버전 1 IndexedDB 데이터는 그대로 읽혀야 한다.
- 설문 문항 제목은 아래 상수를 생성기와 파서가 **같이** 쓴다(Task 2에서 정의). 학생 라벨은 `"${number}. ${name}"`.

## Review Focus

1. **다른 폼이나 옛 CSV를 올림** — 필요한 문항 열이 없으면 저장하지 않고 "이 앱에서 만든 설문의 CSV가 아니에요"와 빠진 문항 번호를 보여 줘야 한다. → Task 2 테스트
2. **설문을 만든 뒤 명단에서 이름·번호를 바꿈** — 라벨이 현재 명단과 안 맞는 응답·평가 대상은 다른 학생에게 잘못 붙지 않고 "명단에 없는 응답"으로 빠져야 한다. → Task 2 테스트
3. **학부모 보기 서술형 안의 이름 변형** — "김가온", "가온이가", "가온아" 모두 "○○"로 가려져야 한다. → Task 4 테스트
4. **응답 0건 또는 일부만 응답한 설문** — 레이더·그래프·상담 카드가 깨지지 않고, 미응답 학생은 "설문 미응답"으로 보여야 한다. → Task 3, Task 9 테스트
5. **학급 삭제·백업 가져오기** — 학급을 지우면 설문도 지워지고, 버전 1 백업은 설문 없이 가져와지며, 깨진 설문 데이터가 든 백업은 거부되어야 한다. → Task 5 테스트

---

## File Structure

```
src/lib/survey/
  types.ts          SurveyResult, SurveyResponse, Score 등
  questions.ts      문항 제목 상수, 라벨 함수 (생성기·파서 공용)
  csv.ts            RFC 4180 CSV 파서
  importCsv.ts      CSV → SurveyResult 미리보기
  appsScript.ts     학급 → Apps Script 코드 문자열
  analyze.ts        학생별 지표, 레이더, 쌍 조건 추천, 그래프·중심 배치 데이터
  parentView.ts     학부모 보기 모델, 이름 가리기
src/lib/db/
  db.ts             (수정) DB_VERSION 2, surveys 스토어
  repo.ts           (수정) SCHEMA_VERSION 2, deleteClass가 surveys도 삭제
  surveys.ts        설문 저장소 함수
  backup.ts         (수정) 버전 2, surveys 포함·검증
src/components/relations/
  RelationsPanel.tsx    탭 컨테이너 (설문 선택, 하위 화면 전환)
  SurveySetup.tsx       스크립트 복사 + 안내
  SurveyUpload.tsx      CSV 업로드 미리보기·저장, 설문 목록·삭제
  RadarView.tsx         관심 학생 레이더 + 쌍 조건 추천
  GraphView.tsx         관계망 (vis-network 동적 import)
  CounselingCard.tsx    교사용/학부모용 카드 + 인쇄
src/app/teacher/page.tsx  (수정) '교우관계' 탭 추가
tests/lib/survey/*.test.ts, tests/lib/db/surveys.test.ts, tests/components/relations/*.test.tsx
```

---

### Task 1: 설문 타입과 문항 상수

**Files:**
- Create: `src/lib/survey/types.ts`, `src/lib/survey/questions.ts`
- Test: `tests/lib/survey/questions.test.ts`

**Interfaces:**
- Consumes: `Student` (`src/lib/seating/types.ts`)
- Produces:
```ts
// types.ts
type Score = 1 | 2 | 3 | 4 | 5;
interface SurveyResponse {
  studentId: string; submittedAt: string;
  ratings: Record<string, Score>;           // 대상 studentId → 점수 (본인 제외)
  best: string[]; wantCloser: string[]; playWith: string[]; helpFrom: string[]; hard: string[];
  hardReason: string; toTeacher: string;
  alone: Score | null; happy: Score | null; schoolFun: Score | null; family: Score | null;
}
interface ParentInclude { ownHardReason: boolean; toTeacher: boolean; hardCount: boolean }
interface SurveyResult {
  id: string; classId: string; name: string; importedAt: string;
  labels: Record<string, string>;            // 업로드 당시 studentId → "번호. 이름" 스냅숏
  responses: Record<string, SurveyResponse>; // 응답한 학생만
  dismissed: string[];                       // pairKey 목록
  parentInclude: Record<string, ParentInclude>;
}
// questions.ts
const Q = {
  name: '1. 내 이름',
  ratings: '2. 친구별 친밀도',
  best: '3. 가장 친한 친구',
  wantCloser: '4. 더 친해지고 싶은 친구',
  playWith: '5. 쉬는 시간에 주로 같이 노는 친구',
  helpFrom: '6. 어려울 때 도움을 청할 수 있는 친구',
  alone: '7. 쉬는 시간에 혼자 있을 때가 있다',
  hard: '8. 지금 함께 있기 힘든 친구',
  hardReason: '8-1. 그 이유',
  happy: '9. 요즘 나는 행복하다',
  schoolFun: '10. 학교생활이 즐겁다',
  family: '11. 우리 가족과 지내는 것이 행복하다',
  toTeacher: '12. 선생님께 하고 싶은 말이나 고민',
} as const;
function studentLabel(s: Pick<Student, 'number' | 'name'>): string;   // "3. 다온"
function pairKey(a: string, b: string): string;                         // 정렬 후 `${min}|${max}`
const EMPTY_INCLUDE: ParentInclude;                                     // 모두 false
```

- [ ] **Step 1:** 실패 테스트: `studentLabel({number:3,name:'다온'})` → `'3. 다온'`; `pairKey('b','a') === pairKey('a','b') === 'a|b'`; Q의 값 13개가 모두 서로 다르고 각각 숫자로 시작.
- [ ] **Step 2:** `npx vitest run tests/lib/survey/questions.test.ts` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5:** `git checkout -b feat/phase2-relations` (처음 한 번), Commit `feat(survey): survey types and question titles`

---

### Task 2: CSV 파서와 응답 가져오기

**Files:**
- Create: `src/lib/survey/csv.ts`, `src/lib/survey/importCsv.ts`
- Test: `tests/lib/survey/csv.test.ts`, `tests/lib/survey/importCsv.test.ts`

**Interfaces:**
- Consumes: Task 1, `ClassRecord` (`@/lib/db/repo`)
- Produces:
```ts
parseCsv(text: string): string[][];   // RFC 4180: 따옴표, 따옴표 안 쉼표·줄바꿈, "" 이스케이프, CRLF/LF, 앞 BOM 제거
interface ImportPreview {
  ok: boolean;
  error?: string;                        // ok=false일 때
  missing?: string[];                    // 빠진 문항 제목
  result?: Omit<SurveyResult, 'id' | 'name' | 'importedAt'>;
  responded: string[]; notResponded: string[];    // studentId
  unmatched: string[];                    // 명단에 없는 "내 이름" 라벨
  duplicates: string[];                   // 두 번 이상 응답한 studentId
}
importSurveyCsv(text: string, cls: ClassRecord): ImportPreview;
```
- 열 찾기: 헤더가 Q의 제목으로 **시작**하는 열. 2번 표 형식은 헤더 `"${Q.ratings}… [${label}]"` 형태(구글 설문 CSV 규칙) — `[`와 `]` 사이 라벨로 대상 학생을 찾는다.
- 체크 문항 값은 `", "`로 구분된 라벨들. 점수 문항 값은 `"1"`~`"5"`(그 외·빈칸 → null / 무시).
- 라벨 → 학생: 현재 명단에서 `studentLabel(s) === label`인 학생. 없으면 무시(평가 대상) 또는 `unmatched`(응답자).
- 본인에 대한 점수·체크는 버린다. 같은 학생 여러 응답 → 마지막 행(타임스탬프 열 순서 = 행 순서) 사용.
- `labels` = 현재 명단 전원의 `studentLabel` 스냅숏.

- [ ] **Step 1: 실패 테스트**
  - `parseCsv('a,"b,c","d""e"\r\n1,"x\ny",3')` → `[['a','b,c','d"e'],['1','x\ny','3']]`; BOM 제거
  - 정상 CSV(가짜 4명, 3명 응답) → `ok:true`, `responded` 3, `notResponded` 1, 점수·체크·서술형이 studentId로 매핑
  - **Review Focus 1:** 8번 열이 없는 CSV → `ok:false`, `error` `'이 앱에서 만든 설문의 CSV가 아니에요'`, `missing`에 `Q.hard` 포함
  - **Review Focus 2:** "내 이름"이 `'9. 하늘'`(명단에 없음) → `unmatched:['9. 하늘']`; 2번 열 라벨이 명단과 다르면 그 점수는 어느 학생에게도 붙지 않음
  - 본인 점수(`[1. 가온]`에 가온이 5점) → `ratings`에 본인 없음
  - 같은 학생 2행 → `duplicates`에 포함, 두 번째 행 값 사용
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(survey): CSV parser and survey import preview`

---

### Task 3: 분석 — 지표, 레이더, 쌍 조건 추천, 그래프 데이터

**Files:**
- Create: `src/lib/survey/analyze.ts`
- Test: `tests/lib/survey/analyze.test.ts`

**Interfaces:**
- Consumes: Task 1, `ClassRecord`, `PairConstraint`
- Produces:
```ts
interface StudentMetrics {
  studentId: string; responded: boolean;
  receivedAvg: number | null; receivedCount: number; lowRatio: number | null;
  mutual: string[]; likesOneSided: string[]; likedByOneSided: string[];
  nominated: string[]; nominatedBy: string[];
  isolatedRef: boolean;               // mutual 0명 && alone ∈ {4,5}
}
analyzeSurvey(result: SurveyResult, cls: ClassRecord): Record<string, StudentMetrics>;  // 현재 명단 학생만 키로
type RadarLevel = 'high' | 'medium';
interface RadarItem { studentId: string; level: RadarLevel; reasons: string[]; noResponse: boolean }
buildRadar(result: SurveyResult, cls: ClassRecord, m: Record<string, StudentMetrics>): { items: RadarItem[]; notResponded: string[] };
interface Suggestion { key: string; a: string; b: string; mutual: boolean; status: 'new' | 'exists' | 'dismissed' }
buildSuggestions(result: SurveyResult, cls: ClassRecord): Suggestion[];
type EdgeFilter = 'mutual' | 'strong' | 'hard';
interface GraphData { nodes: { id: string; label: string; size: number; flag: RadarLevel | null }[]; edges: { from: string; to: string; kind: 'mutual' | 'oneSided' | 'hard' }[] }
buildGraph(result: SurveyResult, cls: ClassRecord, m: Record<string, StudentMetrics>, radar: RadarItem[], filter: EdgeFilter): GraphData;
interface EgoZones { right: string[]; bottom: string[]; top: string[]; left: string[] }
egoZones(centerId: string, result: SurveyResult, cls: ClassRecord, m: Record<string, StudentMetrics>): EgoZones;
```
- 정의(스펙 5.4–5.6 그대로):
  - receivedAvg: 다른 학생들의 `ratings[이 학생]` 평균(삭제된 학생이 준 점수 포함). 없으면 null. lowRatio: 1~2점 비율, receivedCount 0이면 null.
  - mutual: 서로 ≥4. likesOneSided: 내가 ≥4 & 상대 ≤2. likedByOneSided: 그 반대.
  - 레이더(현재 명단 학생만): high = happy ∈ {1,2} 또는 nominatedBy ≥ 2. medium = schoolFun ∈ {1,2} 또는 nominatedBy = 1 또는 (nominatedBy = 0 && receivedCount ≥ 5 && lowRatio ≥ 0.3). 등급은 높은 쪽. 미응답 학생은 happy·schoolFun 판단 안 함, `noResponse:true`. 정렬: high 먼저, 같은 등급은 번호순.
  - reasons 문구 정확히: `'자아 만족도 ${n}점'`, `'학교생활 즐거움 ${n}점'`, `'친구 ${k}명이 함께 있기 힘들다고 적음'`, `'받은 점수 중 낮은 점수 ${Math.round(r*100)}%'`.
  - 추천: hard 지목을 pairKey로 묶음(현재 명단 학생끼리만). `mutual` = 양방향 지목. status: 두 학생 사이 어떤 constraint든 있으면 'exists', `result.dismissed`에 있으면 'dismissed', 아니면 'new'.
  - 그래프: 노드 = 현재 명단 전원, size = `16 + ((receivedAvg ?? 3) - 1) * 6`, flag = 레이더 등급. 'mutual' 필터: mutual 엣지(쌍마다 1개). 'strong': 4점 이상 방향 엣지(mutual이면 mutual 1개로). 'hard': hard 지목 방향 엣지.
  - egoZones: top = 어느 쪽이든 hard 지목 또는 서로 ≤2(둘 다 응답·점수 있음); 그 외 right = mutual; bottom = 어느 한쪽 ≥4; left = 나머지.

- [ ] **Step 1: 실패 테스트** (가짜 6명 설문 픽스처 하나를 `tests/lib/survey/fixture.ts`로 만들어 Task 3·4·UI 테스트가 공유)
  - receivedAvg·lowRatio·mutual·oneSided 값 고정 검증
  - 레이더: happy 2 → high, reasons에 `'자아 만족도 2점'`; 지목 2명 → high `'친구 2명이 함께 있기 힘들다고 적음'`; 지목 0 & 받은 4개 중 2개 낮음 → 레이더 없음(5개 미만); 같은 조건 받은 5개 → medium
  - **Review Focus 4:** 응답 0건 설문 → items `[]`, notResponded = 전원, buildGraph 엣지 0개·노드 전원, 예외 없음
  - 미응답 학생이 2명에게 지목 → high, `noResponse:true`
  - 추천: A→B, B→A → 1개 `mutual:true`; 기존 avoid-pair → 'exists'; dismissed → 'dismissed'
  - egoZones 각 구역 검증
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(survey): metrics, radar, suggestions, graph data`

---

### Task 4: 학부모 보기 모델과 이름 가리기

**Files:**
- Create: `src/lib/survey/parentView.ts`
- Test: `tests/lib/survey/parentView.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 3 `StudentMetrics`, `Student`
- Produces:
```ts
maskNames(text: string, students: Student[]): string;
interface ParentCard {
  studentLabel: string; surveyName: string;
  receivedAvg: number | null; mutualCount: number; playWithCount: number; helpFromCount: number;
  hardCount: number | null;                      // include.hardCount일 때만
  scores: { alone: Score | null; happy: Score | null; schoolFun: Score | null; family: Score | null } | null; // 미응답이면 null
  texts: { label: string; text: string }[];      // 체크된 본인 서술형만, maskNames 적용
}
buildParentCard(result: SurveyResult, studentId: string, cls: ClassRecord, m: StudentMetrics, include: ParentInclude): ParentCard;
containsStudentName(text: string, students: Student[]): boolean;  // 교사 화면 안내용
```
- maskNames: 명단 각 학생에 대해 전체 이름, 그리고 이름이 3글자 이상이면 성을 뺀 이름(앞 1글자 제외)을 찾아 `○○`로 바꾼다. 긴 이름부터 바꾼다. 바로 뒤 조사(`이가|이는|이랑|이를|이한테|아|야|이|가|는|랑|를|한테|에게|도`)는 그대로 둔다(이름 부분만 가림).
- texts 라벨: `'친구 관계 고민(본인)'`(ownHardReason), `'선생님께 하고 싶은 말'`(toTeacher). 다른 학생이 쓴 8-1 이유는 ParentCard 타입에 들어갈 자리가 없다.
- `ParentCard` 어디에도 다른 학생 이름·id가 들어가면 안 된다.

- [ ] **Step 1: 실패 테스트**
  - **Review Focus 3:** 명단 `김가온, 이나래`: `maskNames('김가온이랑 놀기 싫어요. 가온이가 장난쳐요. 나래야 미안')` → `'○○이랑 놀기 싫어요. ○○이가 장난쳐요. ○○야 미안'`
  - include 모두 false → texts `[]`, hardCount null
  - include.toTeacher true → texts 1개, 마스킹 적용
  - 미응답 → scores null
  - `JSON.stringify(buildParentCard(...))`에 다른 학생의 이름·id가 하나도 없음 (픽스처 전원 검사)
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(survey): parent view model and name masking`

---

### Task 5: 저장소 — DB 버전 2, 설문 저장, 백업 버전 2

**Files:**
- Modify: `src/lib/db/db.ts`, `src/lib/db/repo.ts`, `src/lib/db/backup.ts`
- Create: `src/lib/db/surveys.ts`
- Test: `tests/lib/db/surveys.test.ts`, (수정) `tests/lib/db/backup.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces:
```ts
// db.ts: DB_VERSION = 2; store 'surveys' { key: string; value: SurveyResult; indexes: { classId: string } }
// upgrade(db, oldVersion): oldVersion < 1 → 기존 3개 스토어 생성; oldVersion < 2 → surveys 생성
// repo.ts: SCHEMA_VERSION = 2; deleteClass가 같은 트랜잭션에서 surveys도 삭제; wipeAll이 surveys도 비움
// surveys.ts
listSurveys(classId: string): Promise<SurveyResult[]>;   // importedAt 최신순
saveSurvey(s: SurveyResult): Promise<void>;
deleteSurvey(id: string): Promise<void>;
// backup.ts: BackupFile에 surveys?: SurveyResult[] (version 2에서 필수, version 1에서는 없음)
```
- exportBackup: version 2, surveys 포함(선택한 학급 것만).
- parseBackup: version 1 → surveys 없이 OK; version 2 → surveys 배열 필수, 각 항목 `isSurvey` 검증(모든 필드 타입, Score 1–5 정수, 배열 원소 문자열, parentInclude 값 boolean 3개). 실패 → `'백업 파일을 읽을 수 없어요'`.
- importBackup: overwrite → 가져온 학급의 기존 설문 삭제 후 저장, 가져오지 않은 학급의 설문은 건너뜀; add-new → 학급 id 재매핑, 설문 id 새로 발급.

- [ ] **Step 1: 실패 테스트**
  - saveSurvey/listSurveys 최신순, deleteSurvey
  - **Review Focus 5:** deleteClass → 그 학급 설문 사라짐; version 1 백업 JSON(설문 없음) → parse OK, import 후 설문 0건; version 2인데 survey의 `ratings` 값이 `7` → UNREADABLE
  - export → import add-new → 설문 classId가 새 학급 id
  - DB 업그레이드: 버전 1로 DB를 만들고 학급 저장 → 앱 코드로 열기(버전 2) → 학급 그대로, surveys 스토어 존재 (fake-indexeddb에서 `openDB(DB_NAME, 1, …)` 후 캐시 초기화 방법은 구현자 판단)
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npx vitest run` 전체 → PASS (기존 백업 테스트의 version 기대값 수정 포함)
- [ ] **Step 5:** Commit `feat(db): surveys store, schema v2, backup v2 with v1 compatibility`

---

### Task 6: Apps Script 생성기와 "설문 만들기" 화면

**Files:**
- Create: `src/lib/survey/appsScript.ts`, `src/components/relations/SurveySetup.tsx`
- Test: `tests/lib/survey/appsScript.test.ts`, `tests/components/relations/SurveySetup.test.tsx`

**Interfaces:**
- Consumes: Task 1 `Q`, `studentLabel`; `ClassRecord`
- Produces: `buildAppsScript(cls: ClassRecord, title: string): string`, `<SurveySetup cls={ClassRecord} />`
- 생성 코드(Google Apps Script, `function createSeatingSurvey()` 하나):
  - `FormApp.create(title)`, 설명 `'이 설문은 선생님만 봅니다. 솔직하게 답해 주세요.'`, `setCollectEmail(false)`, `setLimitOneResponsePerUser(false)`
  - 문항 제목은 Q의 값 그대로, 순서 1→12(8, 8-1 포함). 1번 드롭다운(필수), 2번 그리드(행 = 전원 라벨, 열 `['1','2','3','4','5']`, 필수 아님, 도움말 `'1 = 힘들어요, 5 = 아주 좋아요. 자기 이름은 건너뛰세요.'`), 3·4·8번 체크박스 최대 3개(`requireSelectAtMost(3)`), 5·6번 체크박스, 7·9·10·11번 1–5 척도, 8-1·12번 문단(필수 아님), 8·8-1 필수 아님.
  - 활성 스프레드시트에 응답 연결(`setDestination(FormApp.DestinationType.SPREADSHEET, SpreadsheetApp.getActiveSpreadsheet().getId())`), 끝에 `Logger.log`와 `SpreadsheetApp.getUi().alert`로 학생용 링크(`getPublishedUrl()`) 표시.
  - 라벨 목록은 `JSON.stringify`로 넣어 따옴표·특수문자 안전.
- SurveySetup: 제목 입력(기본 `${cls.name} 교우관계 설문 YYYY-MM-DD`), 코드 미리보기(읽기 전용 textarea), [복사](clipboard, 실패 시 "직접 선택해서 복사해 주세요"), 순서 안내 7단계(스펙 5.2), 명단이 비면 "명단을 먼저 입력해 주세요".

- [ ] **Step 1: 실패 테스트**
  - 결과 문자열에 Q 값 13개가 모두 들어 있고 등장 순서가 1→12
  - 라벨 `'3. 다온'`이 들어 있고, constraints에 있는 학생 쌍 정보·`avoid`·`must` 문자열은 없음
  - 이름에 `"`가 있는 가짜 학생 → 생성 코드에서 문자열이 깨지지 않음(`JSON.stringify` 결과 포함)
  - SurveySetup: [복사] 클릭 → `navigator.clipboard.writeText`가 buildAppsScript 결과로 호출
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(relations): Apps Script survey generator and setup screen`

---

### Task 7: 탭 컨테이너, CSV 업로드, 설문 목록

**Files:**
- Create: `src/components/relations/RelationsPanel.tsx`, `src/components/relations/SurveyUpload.tsx`
- Modify: `src/app/teacher/page.tsx` (TABS에 `{ id: 'relations', label: '교우관계' }`를 '쌍 조건' 다음에, 렌더링 추가)
- Test: `tests/components/relations/SurveyUpload.test.tsx`, `tests/components/relations/RelationsPanel.test.tsx`

**Interfaces:**
- Consumes: Task 2 `importSurveyCsv`, Task 5 `listSurveys/saveSurvey/deleteSurvey`, Task 6 `SurveySetup`
- Produces: `<RelationsPanel cls={ClassRecord} onChange={(c: ClassRecord) => void} />` — 하위 화면 버튼 [설문 만들기][결과 올리기][관심 학생][관계망][상담 카드]; 설문 선택 드롭다운(최신 기본). Task 8–10이 `survey`, `cls`, `onChange`, `onSurveyChange(s: SurveyResult)`, `openCard(studentId)`를 받아 연결된다 — RelationsPanel이 `selectedStudentId` 상태를 가지고 레이더·그래프에서 카드로 이동시킨다.
- SurveyUpload: 파일 선택(.csv) → 미리보기(응답 n명, 미응답 이름, 명단에 없는 응답, 중복) → 설문 이름 입력(기본 `'YYYY년 M월 설문'`) → [저장] → `saveSurvey` 후 안내 `'내려받은 CSV 파일에는 학생 응답이 들어 있어요. 업로드했으면 지워 주세요.'`. 오류면 error와 missing 목록. 설문 목록에 [지우기](confirm).
- 설문이 하나도 없으면 레이더·관계망·상담 카드 버튼 대신 "먼저 결과를 올려 주세요".
- [ ] **Step 1: 실패 테스트**
  - fixture CSV 파일 업로드 → 미리보기 숫자 → 저장 → listSurveys 1건, 안내 문구
  - 잘못된 CSV → 오류 문구, 저장 버튼 없음
  - teacher 페이지 탭에 '교우관계' 존재 (기존 teacher.test.tsx 확장)
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(relations): relations tab, CSV upload, survey list`

---

### Task 8: 관심 학생 레이더와 쌍 조건 추천

**Files:**
- Create: `src/components/relations/RadarView.tsx`
- Test: `tests/components/relations/RadarView.test.tsx`

**Interfaces:**
- Consumes: Task 3 `analyzeSurvey`, `buildRadar`, `buildSuggestions`; `canAddConstraint` (`@/lib/seating/constraints`); Task 5 `saveSurvey`
- Produces: `<RadarView cls survey onChange onSurveyChange openCard />`
- 목록: 등급 배지(높음/보통), 이름(displayName), reasons를 ` · `로, 미응답이면 "설문 미응답" 배지. 이름 클릭 → `openCard`. 빈 목록 → "지금 기준으로 먼저 챙길 학생이 없어요". 아래에 미응답 전체 목록.
- 추천 섹션 "쌍 조건 추천": 'new'만 버튼 [짝 금지 추가][모둠 금지 추가][넘기기], 'exists'는 "이미 설정됨", 'dismissed'는 숨김. 서로 지목이면 "서로 지목" 표시. 추가 → `canAddConstraint` 메시지 있으면 alert로 표시, 없으면 `onChange({...cls, constraints:[...,{id: randomUUID, a, b, kind}]})`. 넘기기 → `onSurveyChange({...survey, dismissed:[...,key]})` + saveSurvey.
- [ ] **Step 1: 실패 테스트**
  - fixture → high 학생이 먼저, reasons 문구
  - [짝 금지 추가] → onChange constraint `avoid-pair`, 다시 렌더 시 "이미 설정됨"
  - [넘기기] → saveSurvey 호출, 추천 사라짐
  - 레이더 화면 텍스트에 교실 화면용 컴포넌트가 아님을 확인할 필요는 없음 — 대신 `src/app/page.tsx`와 `src/app/present/page.tsx`가 `@/lib/survey` 또는 `@/components/relations`를 import하지 않음을 소스 문자열로 검사하는 테스트 1개 추가
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(relations): attention radar and pair-constraint suggestions`

---

### Task 9: 관계망 그래프

**Files:**
- Create: `src/components/relations/GraphView.tsx`
- Modify: `package.json` (`vis-network` 의존성 추가 — 정확한 버전 고정, `vis-data` 필요 시 함께)
- Test: `tests/components/relations/GraphView.test.tsx`

**Interfaces:**
- Consumes: Task 3 `buildGraph`, `egoZones`, `analyzeSurvey`, `buildRadar`
- Produces: `<GraphView cls survey openCard />`
- `useEffect` 안에서 `await import('vis-network/standalone')`(또는 CSP를 지키는 진입점; `'unsafe-eval'` 없이 동작해야 함 — 안 되면 BLOCKED로 보고)로 네트워크 생성. 노드 색: 기본 보라, flag high 빨강, medium 주황. 엣지: mutual 실선 굵게, oneSided 점선, hard 빨강 점선 + 화살표.
- 필터 select [서로 친함(기본)][4점 이상 전부][함께 있기 힘듦]. 학생 클릭 → 물리 끄고 egoZones로 좌표 배치(중심 (0,0), 구역별 반원 위 균등 배치), 옆 패널에 요약(받은 평균, 서로 친함 n명, 지목받음 n명)과 [상담 카드 열기], [전체 보기]. 범례 문구 고정: `'보라 실선: 서로 친함 · 점선: 한쪽만 좋아함 · 빨강 점선: 함께 있기 힘듦'`.
- 테스트에서는 `vi.mock('vis-network/standalone')`로 Network 생성자 인자를 검사한다.
- [ ] **Step 1: 실패 테스트**
  - fixture → Network에 전달된 노드 수 = 명단 수, 'mutual' 필터 엣지 수 = 픽스처의 서로 친함 쌍 수
  - 필터 'hard' 변경 → setData 호출에 hard 엣지만
  - 노드 클릭 콜백 호출 → 패널에 이름과 [상담 카드 열기]; 클릭 → openCard(id)
  - **Review Focus 4:** 응답 0건 설문 → Network 생성 시 엣지 0개, 오류 없음
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS; `npm run check:out` → 빌드 성공, 외부 리소스 없음
- [ ] **Step 5:** Commit `feat(relations): relationship graph with ego layout`

---

### Task 10: 상담 카드 (교사용·학부모용·인쇄)

**Files:**
- Create: `src/components/relations/CounselingCard.tsx`
- Modify: `src/app/globals.css` (인쇄 영역 규칙 재사용 — 기존 `.print-area` 방식 따름)
- Test: `tests/components/relations/CounselingCard.test.tsx`

**Interfaces:**
- Consumes: Task 3 `analyzeSurvey`, `buildRadar`; Task 4 `buildParentCard`, `containsStudentName`; Task 5 `saveSurvey`; `listSeatingRecords` (`@/lib/db/repo`); `displayName`
- Produces: `<CounselingCard cls survey studentId onSurveyChange onSelectStudent />`
- 교사용(스펙 5.7): 학생 선택(번호순) + 이전/다음, 지표 카드, 레이더 신호, 고립 참고 표시(`'참고: 서로 친한 친구가 없고 혼자 있는 때가 많다고 답했어요'`), 서로 친함/한쪽만 좋아함(양방향)/3–6번 목록(이름), 이 학생을 친한 친구로 고른 학생, 지목한·지목받은 학생과 8-1 원문(지목한 학생 이름과 함께), 본인 점수(7, 9–11)와 12번, 관련 쌍 조건 목록, 최근 확정 자리(최근 기록에서 짝/같은 모둠 학생 이름). 미응답 학생은 "설문 미응답" 안내와 다른 학생들 응답에서 나온 지표만. 삭제된 학생 id는 `'(삭제된 학생)'`.
- 학부모 포함 체크박스 3개: "친구 관계 고민(본인) 포함", "선생님께 하고 싶은 말 포함", "지목받은 수 포함" → `onSurveyChange` + saveSurvey로 `parentInclude[studentId]` 저장. 체크한 서술형에 `containsStudentName`이 true면 `'학생 이름이 들어 있어요. 학부모 보기에서는 ○○로 가려져요'`.
- [학부모 보기] 토글 → `buildParentCard` 결과만 렌더(이름은 이 학생만). [인쇄] → 현재 보기(교사/학부모)를 `.print-area`로 `window.print()`.
- 3단계 자리: 학부모·교사 보기 모두에 `'생활지도·칭찬 기록 (준비 중)'` 섹션 제목만 두지 말고, **아무것도 렌더링하지 않는다**(YAGNI) — 3단계가 이 컴포넌트에 섹션을 추가한다.
- [ ] **Step 1: 실패 테스트**
  - 교사용: 지목받은 학생과 이유 원문, 서로 친한 친구 이름 표시
  - 학부모 보기: 렌더된 텍스트에 **이 학생 외 명단 이름이 하나도 없음**(fixture 전원 검사), 체크 안 한 서술형 없음
  - 체크박스 → saveSurvey 호출, parentInclude 반영, 이름 포함 안내 문구
  - 미응답 학생 카드 → "설문 미응답" 문구, 오류 없음
  - [인쇄] → `window.print` 호출
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(relations): counseling card with parent view and print`

---

### Task 11: 백업 화면 문구, README, 마무리 검증

**Files:**
- Modify: `src/components/teacher/BackupPanel.tsx` (내보내기 안내에 `'설문 응답도 들어 있어요.'` 추가), `README.md`
- Test: 기존 BackupPanel 관련 테스트에 문구 1개

- [ ] **Step 1:** 실패 테스트: 백업 화면에 `'설문 응답도 들어 있어요.'`
- [ ] **Step 2:** Run → FAIL → 구현 → PASS
- [ ] **Step 3:** README에 "교우관계" 사용법(설문 만들기 7단계, CSV 내려받기: 구글 시트 → 파일 → 다운로드 → CSV, 업로드, 레이더, 관계망, 상담 카드·학부모 보기) 추가, 학생 정보 안내에 `'설문 CSV 파일은 업로드한 뒤 지워 주세요'` 추가
- [ ] **Step 4:** `npx vitest run` 전체 PASS, `npm run check:out` PASS
- [ ] **Step 5:** Commit `docs: relationship analysis usage and privacy notes`
