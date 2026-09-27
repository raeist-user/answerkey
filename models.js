const mongoose = require('mongoose');

// A single question inside a section's answer key
const questionSchema = new mongoose.Schema(
  {
    qNum: { type: Number, required: true },
    answer: { type: String, required: true, trim: true },
    // 'mcq'  -> single letter a/b/c/d, gets instant auto-matched radio buttons
    // 'text' -> anything else (numeric value, multi-option, worked value), shown as
    //           a reference key with a self-mark "got it right / wrong" control
    type: { type: String, enum: ['mcq', 'text'], default: 'mcq' },
  },
  { _id: false }
);

// A folder-like chapter, created by the user, e.g. "Motion in a Plane"
const chapterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// A named section inside a chapter, e.g. "Exercise-2 Prabal (JEE Main Level)"
const sectionSchema = new mongoose.Schema(
  {
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: 'Chapter', required: true, index: true },
    name: { type: String, required: true, trim: true },
    questions: { type: [questionSchema], default: [] },
  },
  { timestamps: true }
);

// Your saved progress on one section (single-user: one attempt per section)
const attemptSchema = new mongoose.Schema(
  {
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true, unique: true, index: true },
    answers: { type: Map, of: String, default: {} }, // qNum(string) -> chosen letter / 'right' / 'wrong'
    marked: { type: [Number], default: [] }, // question numbers flagged "for review"
    score: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Chapter = mongoose.model('Chapter', chapterSchema);
const Section = mongoose.model('Section', sectionSchema);
const Attempt = mongoose.model('Attempt', attemptSchema);

module.exports = { Chapter, Section, Attempt };
