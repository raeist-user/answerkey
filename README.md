# Answer Key Instant Match

A customizable answer-key practice tool. You create chapter "folders", add named
sections inside each chapter, paste in that section's answer key in a simple
text format, and students can pick a chapter/section, enter their name, and get
instant right/wrong matching as they answer — with progress saved to MongoDB.

## What it does

- **Manage tab** — create/delete chapters (folders) and sections inside them
  (e.g. Chapter "Motion in a Plane" → Section "Exercise-2 Prabal"). Paste the
  answer key text for a section and save it.
- **Practice tab** — pick a chapter and section, type your name, and answer
  questions. Single-letter (a–d) keys render as clickable MCQ bubbles with
  instant color-coded matching. Any other kind of key (numeric, multi-option,
  worked answer) is shown as a reference key with a self-mark "I got it
  right / wrong" control. A live score tally is always visible, and "Save my
  progress" writes the attempt to MongoDB under your name so you (or anyone
  with your name) can resume later, and a small leaderboard shows everyone
  who has attempted that section.

## Answer key upload format

Paste one question per line as `number. answer`. `.`, `:` or `)` all work as
the separator.

```
1. b
2. d
3. [25]
4. (a,b,d)
5. R = 7√2 cm at 45° from x-axis
```

- A line whose answer is a single letter a–d (with or without parentheses,
  e.g. `b` or `(b)`) becomes an interactive MCQ.
- Anything else — brackets, multiple letters, numbers, worked values — is
  kept as a plain reference key.

When saving, choose **Replace existing key** to wipe and re-set the whole
list, or **Add to / update existing key** to merge new lines into what's
already saved (handy for fixing a typo or adding late questions without
retyping everything).

## Running it

1. **Install Node.js** (v18+) if you don't have it.
2. **Get a MongoDB connection string** — either:
   - a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster, or
   - a local MongoDB server (`mongodb://127.0.0.1:27017/answerKeyApp`).
3. In this folder:
   ```bash
   npm install
   cp .env.example .env
   # edit .env and paste your MONGODB_URI
   npm start
   ```
4. Open **http://localhost:4000** in your browser.

That's it — no separate frontend build step. `server.js` serves the page in
`public/` and exposes the API it calls under `/api/...`.

## Project structure

```
answer-key-app/
├── server.js          # Express API + static file server
├── models.js           # MongoDB (Mongoose) schemas: Chapter, Section, Attempt
├── parseAnswers.js     # turns pasted text into structured questions
├── package.json
├── .env.example
└── public/
    ├── index.html      # Manage / Practice tabs shell
    ├── style.css
    └── app.js           # all frontend logic, talks to the API with fetch
```

## Data model (MongoDB collections)

- **chapters** — `{ name }`
- **sections** — `{ chapter, name, questions: [{ qNum, answer, type }] }`
- **attempts** — `{ section, studentName, answers: { qNum: value }, score, total }`
  One attempt document per (section, studentName) pair — saving again
  overwrites/resumes the same one.

## Notes / things you can extend later

- There's no login — a "student" is just whatever name they type, so two
  people using the same name on the same section will share one saved
  attempt. Add real auth if that matters for your use case.
- Deleting a chapter cascades to delete its sections and any saved attempts
  for those sections.
- To deploy this somewhere permanent (Render, Railway, a VPS, etc.), just set
  the `MONGODB_URI` and `PORT` environment variables there and run `npm start`.
