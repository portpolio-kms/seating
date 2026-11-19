import type { ClassRecord } from '@/lib/db/repo';
import { Q, studentLabel } from './questions';

const j = (v: unknown) => JSON.stringify(v);

/**
 * Google Apps Script that creates the survey form for a class.
 * Only the title and "번호. 이름" labels are embedded; no pair data or other class data.
 * Titles are the Q values verbatim so the CSV importer can match columns by prefix.
 */
export function buildAppsScript(cls: ClassRecord, title: string): string {
  const labels = [...cls.students].sort((a, b) => a.number - b.number).map(studentLabel);
  return `function createSeatingSurvey() {
  var labels = ${j(labels)};
  var form = FormApp.create(${j(title)});
  form.setDescription(${j('이 설문은 선생님만 봅니다. 솔직하게 답해 주세요.')});
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);

  function checkbox(title, help, required, max) {
    var item = form.addCheckboxItem().setTitle(title).setHelpText(help).setChoiceValues(labels).setRequired(required);
    if (max) {
      item.setValidation(FormApp.createCheckboxValidation().requireSelectAtMost(max).build());
    }
  }
  function scale(title, help) {
    form.addScaleItem().setTitle(title).setHelpText(help).setBounds(1, 5).setLabels(${j('전혀 아니다')}, ${j('매우 그렇다')}).setRequired(true);
  }
  function paragraph(title, help) {
    form.addParagraphTextItem().setTitle(title).setHelpText(help).setRequired(false);
  }

  form.addListItem().setTitle(${j(Q.name)}).setHelpText(${j('자기 이름을 골라 주세요.')}).setChoiceValues(labels).setRequired(true);
  form.addGridItem().setTitle(${j(Q.ratings)}).setHelpText(${j('1 = 힘들어요, 5 = 아주 좋아요. 자기 이름은 건너뛰세요.')}).setRows(labels).setColumns(['1', '2', '3', '4', '5']).setRequired(false);
  checkbox(${j(Q.best)}, ${j('가장 친한 친구를 골라 주세요 (최대 3명)')}, false, 3);
  checkbox(${j(Q.wantCloser)}, ${j('더 친해지고 싶은 친구를 골라 주세요 (최대 3명)')}, false, 3);
  checkbox(${j(Q.playWith)}, ${j('쉬는 시간에 주로 같이 노는 친구를 모두 골라 주세요')}, false, 0);
  checkbox(${j(Q.helpFrom)}, ${j('어려울 때 도움을 청할 수 있는 친구를 모두 골라 주세요')}, false, 0);
  scale(${j(Q.alone)}, ${j('1 = 전혀 아니다, 5 = 매우 그렇다')});
  checkbox(${j(Q.hard)}, ${j('지금 함께 있기 힘든 친구가 있다면 골라 주세요 (선택, 최대 3명)')}, false, 3);
  paragraph(${j(Q.hardReason)}, ${j('(선택) 위에서 고른 이유를 적어 주세요.')});
  scale(${j(Q.happy)}, ${j('1 = 전혀 아니다, 5 = 매우 그렇다')});
  scale(${j(Q.schoolFun)}, ${j('1 = 전혀 아니다, 5 = 매우 그렇다')});
  scale(${j(Q.family)}, ${j('1 = 전혀 아니다, 5 = 매우 그렇다')});
  paragraph(${j(Q.toTeacher)}, ${j('(선택) 하고 싶은 말이나 고민을 적어 주세요.')});

  form.setDestination(FormApp.DestinationType.SPREADSHEET, SpreadsheetApp.getActiveSpreadsheet().getId());
  var url = form.getPublishedUrl();
  Logger.log(url);
  SpreadsheetApp.getUi().alert('학생들에게 이 링크를 공유하세요 ' + url);
}
`;
}
