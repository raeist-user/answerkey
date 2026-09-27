const state = {
  chapters: [],
  sectionsByChapter: {}, // chapterId -> [sections]
  expandedChapter: null,
  selectedSectionId: null,
  practice: {
    section: null, // full section doc including answer keys
    answers: {}, // qNum(string) -> chosen letter / 'right' / 'wrong'
    marked: {}, // qNum(string) -> true, when flagged "for review"
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
    if (btn.dataset.tab === 'marked') loadMarkedOverview();
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
  const body = document.getElementById('practice-body');

  if (!sectionId) { alert('Choose a chapter and section first.'); return; }

  body.innerHTML = '';
  body.append(el('div', { class: 'empty-state' }, 'Loading…'));

  try {
    const section = await api(`/sections/${sectionId}`);
    if (!section.questions || section.questions.length === 0) {
      body.innerHTML = '';
      body.append(el('div', { class: 'empty-state' }, 'This section has no answer key uploaded yet — add one in the Manage tab first.'));
      return;
    }

    let previousAnswers = {};
    let previousMarked = {};
    try {
      const prev = await api(`/sections/${sectionId}/attempt`);
      if (prev && prev.answers) previousAnswers = prev.answers;
      if (prev && Array.isArray(prev.marked)) {
        for (const qNum of prev.marked) previousMarked[String(qNum)] = true;
      }
    } catch (err) {
      console.warn('No previous attempt loaded (this is normal the first time):', err.message);
    }

    state.practice.section = section;
    state.practice.answers = { ...previousAnswers };
    state.practice.marked = { ...previousMarked };

    renderQuiz();
  } catch (err) {
    console.error('startPractice failed:', err);
    body.innerHTML = '';
    body.append(el('div', { class: 'status-msg err' }, `Couldn't load that section: ${err.message}. Check the browser console for details.`));
  }
}

function scrollToQuestion(qNum) {
  const row = document.getElementById(`q-row-${qNum}`);
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 900);
}

function renderQuiz() {
  const body = document.getElementById('practice-body');
  body.innerHTML = '';
  const { section, answers, marked } = state.practice;

  const markedBar = el('div', { class: 'marked-bar', id: 'marked-bar' });
  body.append(markedBar);

  function refreshMarkedBar() {
    markedBar.innerHTML = '';
    const markedNums = Object.keys(marked)
      .filter((k) => marked[k])
      .map(Number)
      .sort((a, b) => a - b);

    if (markedNums.length === 0) {
      markedBar.classList.remove('visible');
      return;
    }
    markedBar.classList.add('visible');
    markedBar.append(el('span', { class: 'marked-bar-label' }, `Marked for review (${markedNums.length}):`));
    for (const n of markedNums) {
      markedBar.append(el('button', { class: 'marked-chip', onclick: () => scrollToQuestion(n) }, `Q${n}`));
    }
  }

  const sheet = el('div', { class: 'quiz-sheet' });

  for (const q of [...section.questions].sort((a, b) => a.qNum - b.qNum)) {
    const key = String(q.qNum);
    const row = el('div', { class: 'q-row', id: `q-row-${q.qNum}` });
    if (marked[key]) row.classList.add('marked');
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

    const flagBtn = el('button', {
      class: 'flag-btn',
      title: 'Mark for review',
      onclick: () => {
        if (marked[key]) delete marked[key];
        else marked[key] = true;
        row.classList.toggle('marked', !!marked[key]);
        flagBtn.classList.toggle('active', !!marked[key]);
        flagBtn.textContent = marked[key] ? '★' : '☆';
        refreshMarkedBar();
      },
    }, marked[key] ? '★' : '☆');
    flagBtn.classList.toggle('active', !!marked[key]);
    row.append(flagBtn);

    sheet.append(row);
  }

  body.append(sheet);
  refreshMarkedBar();

  const scoreBar = el('div', { class: 'score-bar', id: 'score-bar' });
  body.append(scoreBar);

  updateScoreBar();
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
  const { section, answers, marked } = state.practice;
  const markedList = Object.keys(marked).filter((k) => marked[k]).map(Number);
  const saveBtn = document.querySelector('#score-bar .btn');
  const original = saveBtn ? saveBtn.textContent : '';
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  try {
    await api(`/sections/${section._id}/attempts`, {
      method: 'POST',
      body: JSON.stringify({ answers, marked: markedList }),
    });
    if (saveBtn) saveBtn.textContent = 'Saved ✓';
  } catch (err) {
    alert('Could not save: ' + err.message);
    if (saveBtn) saveBtn.textContent = original;
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      setTimeout(() => { if (saveBtn) saveBtn.textContent = original; }, 1500);
    }
  }
}

// ================================================================
// MARKED OVERVIEW
// ================================================================
async function loadMarkedOverview() {
  const holder = document.getElementById('marked-overview');
  holder.innerHTML = '';
  holder.append(el('div', { class: 'empty-state' }, 'Loading…'));

  try {
    const groups = await api('/marked');
    holder.innerHTML = '';

    if (groups.length === 0) {
      holder.append(
        el('div', { class: 'empty-state' }, 'Nothing marked yet. While practicing, tap ☆ next to a question to flag it for review — it will show up here.')
      );
      return;
    }

    for (const g of groups) {
      const box = el('div', { class: 'marked-group' });
      box.append(
        el('div', { class: 'marked-group-title' }, [g.chapterName, el('span', { class: 'sep' }, '/'), g.sectionName])
      );
      const chipRow = el('div', { class: 'marked-chip-row' });
      for (const q of g.questions) {
        chipRow.append(
          el(
            'button',
            { class: 'marked-chip', title: q.answer ? `Key: ${q.answer}` : '', onclick: () => goToMarkedQuestion(g.chapterId, g.sectionId, q.qNum) },
            `Q${q.qNum}`
          )
        );
      }
      box.append(chipRow);
      holder.append(box);
    }
  } catch (err) {
    holder.innerHTML = '';
    holder.append(el('div', { class: 'status-msg err' }, 'Could not load marked questions: ' + err.message));
  }
}

// Jump from the Marked tab straight into that question inside its section
async function goToMarkedQuestion(chapterId, sectionId, qNum) {
  document.querySelector('.tab-btn[data-tab="practice"]').click();

  const chapterSel = document.getElementById('practice-chapter');
  chapterSel.value = chapterId;

  const sectionSel = document.getElementById('practice-section');
  sectionSel.innerHTML = '<option value="">Select section…</option>';
  const sections = state.sectionsByChapter[chapterId] || [];
  for (const s of sections) {
    sectionSel.append(el('option', { value: s._id }, `${s.name} (${s.questions.length})`));
  }
  sectionSel.disabled = sections.length === 0;
  sectionSel.value = sectionId;

  await startPractice();
  setTimeout(() => scrollToQuestion(qNum), 80);
}

// ---------------- boot ----------------
loadChapters();
