import fs from 'fs';
import path from 'path';
import { OshcQuizFlow } from '../src/quiz/flow.js';
import { QUIZ_CURRICULUM } from '../src/quiz/curriculum.js';

const flow = new OshcQuizFlow({} as any);

// 1. Export main flow (Session 1 default)
const mainDefinition = flow.definition(0);
const mainOutputPath = path.resolve('flows/oshc_quiz_flow.json');
fs.mkdirSync(path.dirname(mainOutputPath), { recursive: true });
fs.writeFileSync(mainOutputPath, JSON.stringify(mainDefinition, null, 2) + '\n', 'utf8');
console.log(`Exported main flow -> ${mainOutputPath}`);

// 2. Export individual flows for all 7 sessions
const sessionsDir = path.resolve('flows/sessions');
fs.mkdirSync(sessionsDir, { recursive: true });

QUIZ_CURRICULUM.forEach((curriculumSession, idx) => {
  const sessionDef = flow.definition(idx);
  const sessionPath = path.join(sessionsDir, `session_${idx + 1}.json`);
  fs.writeFileSync(sessionPath, JSON.stringify(sessionDef, null, 2) + '\n', 'utf8');
  console.log(`Exported Session ${idx + 1} (${curriculumSession.title}) -> ${sessionPath}`);
});
