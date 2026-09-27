require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const { Chapter, Section, Attempt } = require('./models');
const { parseAnswerText } = require('./parseAnswers');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

// ---------- helpers ----------
function gradeMcq(question, chosen) {
  if (!chosen) return null;
  return String(chosen).trim().toLowerCase() === String(question.answer).replace(/[()]/g, '').trim().toLowerCase();
}

// ---------- Chapters ----------
app.get('/api/chapters', async (req, res) => {
  const chapters = await Chapter.find().sort({ createdAt: 1 });
  res.json(chapters);
});

app.post('/api/chapters', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Chapter name is required' });
  const chapter = await Chapter.create({ name: name.trim() });
  res.status(201).json(chapter);
});

app.delete('/api/chapters/:id', async (req, res) => {
  const { id } = req.params;
  const sections = await Section.find({ chapter: id }, '_id');
  const sectionIds = sections.map((s) => s._id);
  await Attempt.deleteMany({ section: { $in: sectionIds } });
  await Section.deleteMany({ chapter: id });
  await Chapter.findByIdAndDelete(id);
  res.json({ ok: true });
});

// ---------- Sections ----------
app.get('/api/chapters/:chapterId/sections', async (req, res) => {
  const sections = await Section.find({ chapter: req.params.chapterId }).sort({ createdAt: 1 });
  res.json(sections);
});

app.post('/api/chapters/:chapterId/sections', async (req, res) => {
  const { name } = req.body;
  const { chapterId } = req.params;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Section name is required' });
  const chapter = await Chapter.findById(chapterId);
  if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
  const section = await Section.create({ chapter: chapterId, name: name.trim(), questions: [] });
  res.status(201).json(section);
});

app.get('/api/sections/:id', async (req, res) => {
  const section = await Section.findById(req.params.id);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  res.json(section);
});

app.delete('/api/sections/:id', async (req, res) => {
  await Attempt.deleteMany({ section: req.params.id });
  await Section.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// Upload / replace the answer key for a section from pasted or uploaded text
app.post('/api/sections/:id/upload', async (req, res) => {
  const { text, mode } = req.body; // mode: 'replace' (default) or 'append'
  const section = await Section.findById(req.params.id);
  if (!section) return res.status(404).json({ error: 'Section not found' });

  const parsed = parseAnswerText(text || '');
  if (parsed.length === 0) {
    return res.status(400).json({ error: 'No valid "number. answer" lines were found in that text.' });
  }

  if (mode === 'append') {
    const byNum = new Map(section.questions.map((q) => [q.qNum, q]));
    for (const q of parsed) byNum.set(q.qNum, q);
    section.questions = Array.from(byNum.values()).sort((a, b) => a.qNum - b.qNum);
  } else {
    section.questions = parsed;
  }

  await section.save();
  res.json(section);
});

// ---------- Attempts ----------
// Save/update a student's run through a section. studentName + section
// together identify one ongoing attempt, so re-submitting resumes/overwrites it.
app.post('/api/sections/:id/attempts', async (req, res) => {
  const { studentName, answers } = req.body;
  if (!studentName || !studentName.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const section = await Section.findById(req.params.id);
  if (!section) return res.status(404).json({ error: 'Section not found' });

  let score = 0;
  const total = section.questions.length;
  const graded = {};

  for (const q of section.questions) {
    const given = answers ? answers[String(q.qNum)] : undefined;
    if (given === undefined || given === null || given === '') continue;

    if (q.type === 'mcq') {
      const isRight = gradeMcq(q, given);
      graded[String(q.qNum)] = given;
      if (isRight) score += 1;
    } else {
      // self-marked: client sends 'right' or 'wrong'
      graded[String(q.qNum)] = given;
      if (given === 'right') score += 1;
    }
  }

  const attempt = await Attempt.findOneAndUpdate(
    { section: section._id, studentName: studentName.trim() },
    { answers: graded, score, total },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json(attempt);
});

// Fetch a student's existing attempt for a section, to resume where they left off
app.get('/api/sections/:id/attempts/:studentName', async (req, res) => {
  const attempt = await Attempt.findOne({
    section: req.params.id,
    studentName: req.params.studentName.trim(),
  });
  res.json(attempt || null);
});

// Leaderboard-style list of everyone who has attempted a section
app.get('/api/sections/:id/attempts', async (req, res) => {
  const attempts = await Attempt.find({ section: req.params.id }).sort({ updatedAt: -1 });
  res.json(attempts);
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Fallback to the SPA for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Answer Key Instant Match running on http://localhost:${PORT}`));
