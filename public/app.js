const state = {
  chapters: [],
  sectionsByChapter: {}, // chapterId -> [sections]
  expandedChapter: null,
  selectedSectionId: null,
  practice: {
    section: null, // full section doc including answer keys
    studentName: '',
    answers: {}, // qNum(string) -> chosen letter / 'right' / 'wrong'
  },
};

// ---------------- generic helpers ----------------
async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || 'Request failed');
  return data;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// ---------------- tabs ----------------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.dataset.tab).classList.add('active');
  });
});

// ================================================================
// MANAGE VIEW
// ================================================================
async function loadChapters() {
  state.chapters = await api('/chapters');
  await Promise.all(
    state.chapters.map(async (c) => {
      state.sectionsByChapter[c._id] = await api(`/chapters/${c._id}/sections`);
    })
  );
  renderChapterTree();
  populatePracticeChapters();
}

function renderChapterTree() {
  const tree = document.getElementById('chapter-tree');
  tree.innerHTML = '';

  if (state.chapters.length === 0) {
    tree.append(el('div', { class: 'empty-state' }, 'No chapters yet. Add one above to get started.'));
    return;
  }

  for (const chapter of state.chapters) {
    const isExpanded = state.expandedChapter === chapter._id;
    const item = el('div', { class: 'chapter-item' });

    const row = el(
      'div',
      { class: 'chapter-row', onclick: () => { state.expandedChapter = isExpanded ? null : chapter._id; renderChapterTree(); } },
      [
        el('span', {}, [el('span', { class: 'folder-mark' }, isExpanded ? '▾' : '▸'), chapter.name]),
        el('button', {
          class: 'icon-btn',
          title: 'Delete chapter',
          onclick: (e) => { e.stopPropagation(); deleteChapter(chapter._id); },
        }, '✕'),
      ]
    );
    item.append(row);

    if (isExpanded) {
      const sections = state.sectionsByChapter[chapter._id] || [];
      const list = el('div', { class: 'section-list' });

      if (sections.length === 0) {
        list.append(el('div', { class: 'empty-state' }, 'No sections yet.'));
      }

      for (const section of sections) {
        list.append(
          el(
            'div',
            {
              class: 'section-row' + (state.selectedSectionId === section._id ? ' selected' : ''),
              onclick: () => selectSection(chapter, section),
            },
            [
              el('span', {}, `${section.name} (${section.questions.length})`),
              el('button', {
                class: 'icon-btn',
                title: 'Delete section',
                onclick: (e) => { e.stopPropagation(); deleteSection(chapter._id, section._id); },
              }, '✕'),
            ]
          )
        );
      }

      const addRow = el('div', { class: 'add-section-row' }, [
        el('input', { type: 'text', placeholder: 'New section name', id: `new-section-${chapter._id}` }),
        el('button', {
          class: 'btn secondary',
          onclick: () => addSection(chapter._id),
        }, '+ Add'),
      ]);
      list.append(addRow);
      item.append(list);
    }

    tree.append(item);
  }
}

async function addChapter() {
  const input = document.getElementById('new-chapter-name');
  const name = input.value.trim();
  if (!name) return;
  await api('/chapters', { method: 'POST', body: JSON.stringify({ name }) });
  input.value = '';
  await loadChapters();
}
document.getElementById('add-chapter-btn').addEventListener('click', addChapter);
document.getElementById('new-chapter-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') addChapter(); });

async function deleteChapter(id) {
  if (!confirm('Delete this chapter and all of its sections and saved attempts?')) return;
  await api(`/chapters/${id}`, { method: 'DELETE' });
  if (state.selectedSectionId && state.sectionsByChapter[id]?.some((s) => s._id === state.selectedSectionId)) {
    state.selectedSectionId = null;
    renderEditorEmpty();
  }
  await loadChapters();
}

async function addSection(chapterId) {
  const input = document.getElementById(`new-section-${chapterId}`);
  const name = input.value.trim();
  if (!name) return;
  await api(`/chapters/${chapterId}/sections`, { method: 'POST', body: JSON.stringify({ name }) });
  await loadChapters();
}

async function deleteSection(chapterId, sectionId) {
  if (!confirm('Delete this section and its saved answer key?')) return;
  await api(`/sections/${sectionId}`, { method: 'DELETE' });
  if (state.selectedSectionId === sectionId) {
    state.selectedSectionId = null;
    renderEditorEmpty();
  }
  await loadChapters();
}

function renderEditorEmpty() {
  const panel = document.getElementById('editor-panel');
  panel.innerHTML = '';
  panel.append(el('div', { class: 'empty-state' }, 'Select or create a section on the left to upload its answer key.'));
}

async function selectSection(chapter, section) {
  state.selectedSectionId = section._id;
  renderChapterTree();
  const fresh = await api(`/sections/${section._id}`);
  renderEditor(chapter, fresh);
}

function renderEditor(chapter, section) {
  const panel = document.getElementById('editor-panel');
  panel.innerHTML = '';

  panel.append(el('div', { class: 'breadcrumb' }, `${chapter.name} / `));
  panel.append(el('h2', {}, section.name));

  panel.append(
    el('div', { class: 'format-hint' }, [
      'Paste one question per line as ',
      el('code', {}, 'number. answer'),
      '. A single letter a–d becomes a clickable MCQ; anything else (',
      el('code', {}, '[25]'),
      ', ',
      el('code', {}, '(a,b,d)'),
      ', worked values) is kept as a reference key. Example:',
      el('br'),
      el('code', {}, '1. b'),
      el('br'),
      el('code', {}, '2. [150°]'),
      el('br'),
      el('code', {}, '3. (a,b,d)'),
    ])
  );

  const textarea = el('textarea', { class: 'answer-input', placeholder: '1. b\n2. d\n3. [25]\n...' });
  panel.append(textarea);

  const statusMsg = el('div', { class: 'status-msg' });

  const modeToggle = el('div', { class: 'mode-toggle' }, [
    el('label', {}, [
      el('input', { type: 'radio', name: 'upload-mode', value: 'replace', checked: 'checked' }),
      'Replace existing key',
    ]),
    el('label', {}, [
      el('input', { type: 'radio', name: 'upload-mode', value: 'append' }),
      'Add to / update existing key',
    ]),
  ]);

  const saveBtn = el('button', { class: 'btn' }, 'Save answer key');
  saveBtn.addEventListener('click', async () => {
    const mode = panel.querySelector('input[name="upload-mode"]:checked').value;
    saveBtn.disabled = true;
    try {
      const updated = await api(`/sections/${section._id}/upload`, {
        method: 'POST',
        body: JSON.stringify({ text: textarea.value, mode }),
      });
      statusMsg.className = 'status-msg ok';
      statusMsg.textContent = `Saved ${updated.questions.length} questions.`;
      textarea.value = '';
      renderKeyTable(panel, updated.questions);
      await loadChapters();
    } catch (err) {
      statusMsg.className = 'status-msg err';
      statusMsg.textContent = err.message;
    } finally {
      saveBtn.disabled = false;
    }
  });

  panel.append(el('div', { class: 'upload-row' }, [saveBtn, modeToggle]));
  panel.append(statusMsg);

  renderKeyTable(panel, section.questions);
}

function renderKeyTable(panel, questions) {
  const old = panel.querySelector('.key-table');
  if (old) old.remove();

  if (!questions || questions.length === 0) {
    panel.append(el('div', { class: 'empty-state key-table' }, 'No answer key saved yet.'));
    return;
  }

  const table = el('table', { class: 'key-table' });
  table.append(
    el('tr', {}, [el('th', {}, 'Q#'), el('th', {}, 'Answer'), el('th', {}, 'Type')])
  );
  for (const q of [...questions].sort((a, b) => a.qNum - b.qNum)) {
    table.append(
      el('tr', {}, [
        el('td', { class: 'qn' }, String(q.qNum)),
        el('td', {}, q.answer),
        el('td', {}, el('span', { class: 'badge' }, q.type)),
      ])
    );
  }
  panel.append(table);
}

// ================================================================
// PRACTICE VIEW
// ================================================================
function populatePracticeChapters() {
  const sel = document.getElementById('practice-chapter');
  const current = sel.value;
  sel.innerHTML = '<option value="">Select chapter…</option>';
  for (const c of state.chapters) {
    sel.append(el('option', { value: c._id }, c.name));
  }
  if (current) sel.value = current;
}

document.getElementById('practice-chapter').addEventListener('change', async (e) => {
  const sectionSel = document.getElementById('practice-section');
  sectionSel.innerHTML = '<option value="">Select section…</option>';
  sectionSel.disabled = true;
  const chapterId = e.target.value;
  if (!chapterId) return;
  const sections = state.sectionsByChapter[chapterId] || (await api(`/chapters/${chapterId}/sections`));
  for (const s of sections) {
    sectionSel.append(el('option', { value: s._id }, `${s.name} (${s.questions.length})`));
  }
  sectionSel.disabled = sections.length === 0;
});

document.getElementById('start-practice-btn').addEventListener('click', startPractice);

async function startPractice() {
  const sectionId = document.getElementById('practice-section').value;
  const studentName = document.getElementById('practice-name').value.trim();
  const body = document.getElementById('practice-body');

  if (!sectionId) { alert('Choose a chapter and section first.'); return; }
  if (!studentName) { alert('Enter your name so your progress can be saved.'); return; }

  const section = await api(`/sections/${sectionId}`);
  if (!section.questions || section.questions.length === 0) {
    body.innerHTML = '';
    body.append(el('div', { class: 'empty-state' }, 'This section has no answer key uploaded yet — add one in the Manage tab first.'));
    return;
  }

  let previousAnswers = {};
  try {
    const prev = await api(`/sections/${sectionId}/attempts/${encodeURIComponent(studentName)}`);
    if (prev && prev.answers) previousAnswers = prev.answers;
  } catch (_) { /* no previous attempt, ignore */ }

  state.practice.section = section;
  state.practice.studentName = studentName;
  state.practice.answers = { ...previousAnswers };

  renderQuiz();
}

function renderQuiz() {
  const body = document.getElementById('practice-body');
  body.innerHTML = '';
  const { section, answers } = state.practice;

  const sheet = el('div', { class: 'quiz-sheet' });

  for (const q of [...section.questions].sort((a, b) => a.qNum - b.qNum)) {
    const key = String(q.qNum);
    const row = el('div', { class: 'q-row' });
    row.append(el('div', { class: 'q-bubble' }, `Q${q.qNum}`));

    if (q.type === 'mcq') {
      const options = el('div', { class: 'options' });
      const feedback = el('span', { class: 'feedback muted' }, 'Not answered');

      const paint = () => {
        const chosen = answers[key];
        options.querySelectorAll('.opt-btn').forEach((b) => {
          b.classList.remove('chosen', 'right', 'wrong');
          if (b.dataset.opt === chosen) {
            const isRight = chosen === q.answer.replace(/[()]/g, '').trim().toLowerCase();
            b.classList.add('chosen', isRight ? 'right' : 'wrong');
          }
        });
        if (!chosen) {
          feedback.className = 'feedback muted';
          feedback.textContent = 'Not answered';
        } else if (chosen === q.answer.replace(/[()]/g, '').trim().toLowerCase()) {
          feedback.className = 'feedback right';
          feedback.textContent = '✓ Correct';
        } else {
          feedback.className = 'feedback wrong';
          feedback.textContent = `✗ Key: ${q.answer}`;
        }
      };

      ['a', 'b', 'c', 'd'].forEach((opt) => {
        const btn = el('button', {
          class: 'opt-btn',
          'data-opt': opt,
          onclick: () => { answers[key] = opt; paint(); updateScoreBar(); },
        }, opt);
        options.append(btn);
      });

      row.append(options, feedback);
      paint();
    } else {
      row.append(el('div', { class: 'text-key' }, `Key: ${q.answer}`));
      const markRight = el('button', { class: 'right' }, '✓ I got it right');
      const markWrong = el('button', { class: 'wrong' }, '✗ I got it wrong');
      const paintSelf = () => {
        markRight.classList.toggle('active', answers[key] === 'right');
        markWrong.classList.toggle('active', answers[key] === 'wrong');
      };
      markRight.addEventListener('click', () => { answers[key] = 'right'; paintSelf(); updateScoreBar(); });
      markWrong.addEventListener('click', () => { answers[key] = 'wrong'; paintSelf(); updateScoreBar(); });
      row.append(el('div', { class: 'self-mark' }, [markRight, markWrong]));
      paintSelf();
    }

    sheet.append(row);
  }

  body.append(sheet);

  const scoreBar = el('div', { class: 'score-bar', id: 'score-bar' });
  body.append(scoreBar);

  const leaderboardHolder = el('div', { id: 'leaderboard-holder' });
  body.append(leaderboardHolder);

  updateScoreBar();
  loadLeaderboard();
}

function updateScoreBar() {
  const { section, answers } = state.practice;
  const total = section.questions.length;
  let answered = 0;
  let correct = 0;

  for (const q of section.questions) {
    const given = answers[String(q.qNum)];
    if (given === undefined || given === '') continue;
    answered += 1;
    if (q.type === 'mcq') {
      if (given === q.answer.replace(/[()]/g, '').trim().toLowerCase()) correct += 1;
    } else if (given === 'right') {
      correct += 1;
    }
  }

  const bar = document.getElementById('score-bar');
  bar.innerHTML = '';
  bar.append(
    el('span', {}, `${answered} / ${total} answered  ·  ${correct} correct`),
    el('button', { class: 'btn', onclick: saveAttempt }, 'Save my progress')
  );
}

async function saveAttempt() {
  const { section, studentName, answers } = state.practice;
  try {
    await api(`/sections/${section._id}/attempts`, {
      method: 'POST',
      body: JSON.stringify({ studentName, answers }),
    });
    loadLeaderboard();
  } catch (err) {
    alert('Could not save: ' + err.message);
  }
}

async function loadLeaderboard() {
  const { section } = state.practice;
  const holder = document.getElementById('leaderboard-holder');
  if (!holder) return;
  const attempts = await api(`/sections/${section._id}/attempts`);
  holder.innerHTML = '';
  if (attempts.length === 0) return;

  const box = el('div', { class: 'leaderboard' });
  box.append(el('h3', {}, 'Saved attempts for this section'));
  const table = el('table');
  table.append(el('tr', {}, [el('th', {}, 'Name'), el('th', {}, 'Score'), el('th', {}, 'Last saved')]));
  for (const a of attempts) {
    table.append(
      el('tr', {}, [
        el('td', {}, a.studentName),
        el('td', {}, `${a.score} / ${a.total}`),
        el('td', {}, new Date(a.updatedAt).toLocaleString()),
      ])
    );
  }
  box.append(table);
  holder.append(box);
}

// ---------------- boot ----------------
loadChapters();
