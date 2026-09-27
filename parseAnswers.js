// Accepts free-form pasted text, one question per line, in any of these forms:
//   1. b
//   1: b
//   1) b
//   6. [150°]
//   6. (a,b,d)
//   58. (i) 10 sec (ii) 980 m (iii) 98√2 m/s
//
// Lines that don't start with "<number><separator>" are ignored, so stray
// blank lines or headers pasted in by mistake are simply skipped.
function parseAnswerText(raw) {
  if (!raw || typeof raw !== 'string') return [];

  const lineRe = /^\s*(\d+)\s*[.):]\s*(.+?)\s*$/;
  const lines = raw.split(/\r?\n/);
  const questions = [];

  for (const line of lines) {
    const match = line.match(lineRe);
    if (!match) continue;

    const qNum = Number(match[1]);
    const answer = match[2].trim();
    if (!answer) continue;

    // A bare single letter a-d (optionally wrapped in parentheses) is treated
    // as a multiple-choice key that can be auto-matched against a click.
    // Anything else (brackets, numbers, multiple letters, worked answers)
    // is kept as a reference key with self-marking instead.
    const bareLetterMatch = answer.replace(/[()\s]/g, '').match(/^[a-dA-D]$/);
    const type = bareLetterMatch ? 'mcq' : 'text';

    questions.push({ qNum, answer, type });
  }

  // de-duplicate by qNum, keeping the last occurrence (lets a person fix a
  // typo lower down in the same paste without deleting the earlier line)
  const byNum = new Map();
  for (const q of questions) byNum.set(q.qNum, q);

  return Array.from(byNum.values()).sort((a, b) => a.qNum - b.qNum);
}

module.exports = { parseAnswerText };
