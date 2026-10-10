# Technovation — DSA interview practice

A responsive, browser-based DSA tracker for a 220-day college interview-prep path. The question library is stored in `src/data/questions.json`; each entry has a LeetCode ID, difficulty, data structure, pattern, recommended optimal approach, time complexity, and auxiliary-space complexity.

## Run locally

```bash
Copy-Item .env.example .env
# Set a private value for DSA_MARK_PASSWORD in .env.
npm install
npm run dev
```

Vite validates completion marks through a server-side endpoint; the password is not bundled into browser code.

Vite serves the app locally. `npm run build` creates a production build in `dist/`; then `npm run preview` serves that build with the same password endpoint. If you deploy it, use a server that provides `/api/mark` and keep `.env` secret; hosting only the static `dist/` folder cannot enforce marking passwords.

## Features

- 220 questions sequenced from foundations through advanced graphs and dynamic programming
- Search across titles, LeetCode IDs, topics, patterns, data structures, and algorithms
- Filters for topic, difficulty, data structure, and pattern
- Expandable per-question analysis and direct LeetCode links
- Bookmarks and font size saved in browser local storage; marking a question solved requires the `.env` password
- Responsive layout for desktop and mobile

Bookmarks and display size stay in the current browser. No account or database is required.

## Curriculum sources

- [Striver's A2Z DSA Sheet](https://takeuforward.org/prep-hub/strivers-a2z-dsa-sheet?page=sheet&open=1995%2C1997%2C2027%2C2013)
- [NeetCode 250](https://neetcode.io/practice/practice/neetcode250)

The list is a curated interview core shaped by the overlap in topics and recurring LeetCode-style problems across both paths. When an A2Z prompt does not have a direct LeetCode title, the curriculum uses the closest standard LeetCode equivalent. Complexity labels assume the standard optimal interview solution and exclude the returned output unless stated.
