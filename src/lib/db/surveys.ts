import type { SurveyResult } from '@/lib/survey/types';
import { getDb } from './db';

/** Newest import first. */
export async function listSurveys(classId: string): Promise<SurveyResult[]> {
  const all = await (await getDb()).getAllFromIndex('surveys', 'classId', classId);
  return all.sort((a, b) => (a.importedAt < b.importedAt ? 1 : a.importedAt > b.importedAt ? -1 : 0));
}

export async function saveSurvey(s: SurveyResult): Promise<void> {
  await (await getDb()).put('surveys', s);
}

export async function deleteSurvey(id: string): Promise<void> {
  await (await getDb()).delete('surveys', id);
}
