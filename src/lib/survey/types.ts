export type Score = 1 | 2 | 3 | 4 | 5;

export interface SurveyResponse {
  studentId: string;
  submittedAt: string;
  ratings: Record<string, Score>; // 대상 studentId → 점수 (본인 제외)
  best: string[];
  wantCloser: string[];
  playWith: string[];
  helpFrom: string[];
  hard: string[];
  hardReason: string;
  toTeacher: string;
  alone: Score | null;
  happy: Score | null;
  schoolFun: Score | null;
  family: Score | null;
}

export interface ParentInclude {
  ownHardReason: boolean;
  toTeacher: boolean;
  hardCount: boolean;
}

export interface SurveyResult {
  id: string;
  classId: string;
  name: string;
  importedAt: string;
  labels: Record<string, string>; // 업로드 당시 studentId → "번호. 이름" 스냅숏
  responses: Record<string, SurveyResponse>; // 응답한 학생만
  dismissed: string[]; // pairKey 목록
  parentInclude: Record<string, ParentInclude>;
}
