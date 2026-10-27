# DSAvation

DSAvation combines a 220-question interview-prep library, private self-tracking, and a college-club challenge. The curriculum is kept in the server-only `server/data/questions.json` file; approved members load it through an authenticated API. Each question includes its LeetCode ID, difficulty, data structure, pattern, recommended approach, and time and auxiliary-space complexity.

## Run locally

Requirements: Node.js 20.19 or newer and an accessible MongoDB database.

```powershell
Copy-Item .env.example .env
# Fill in MONGODB_URI and add your first administrator to ADMIN_EMAILS.
npm install
npm run dev
```

Vite serves the React app and mounts the same `/api/...` handler used by Vercel. `npm run build` creates the static frontend in `dist/`. `npm run preview` previews only that static build; use `npm run dev` to use the local API.

## Vercel deployment

Import the repository as a Vite project in Vercel. The project configuration builds with `npm run build`, serves `dist/`, and routes `/api/...` requests to the serverless handler in `api/handler.js`.

Set the following in Vercel **Project Settings → Environment Variables** for each environment you use. Add secrets in the provider dashboard; do not commit `.env` or put server credentials in a `VITE_` variable.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string. Use a newly rotated credential and restrict its database user to the DSAvation database. |
| `MONGODB_DB` | Database name; `dsavation` by default. |
| `ADMIN_EMAILS` | Comma-separated `@abes.ac.in` accounts automatically approved as administrators. Add the initial club administrator here. |
| `GITHUB_OAUTH_CLIENT_ID` | Client ID of a GitHub OAuth App used to link a member's GitHub account. |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App secret. |
| `GITHUB_OAUTH_CALLBACK_URL` | Exact callback URL, `https://YOUR_DOMAIN/api/auth/github/callback`. Add this URL to the OAuth App. |
| `GITHUB_TOKEN` | Optional token for private repository reads and higher GitHub API limits. Public repositories can be checked without it. |
| `SESSION_COOKIE_SECURE` | Optional; Vercel automatically marks session cookies secure over HTTPS. |

Keep Vercel's production deployment on HTTPS. After adding or changing variables, redeploy so the functions receive them. The first API request creates the required MongoDB indexes.

## Accounts and roles

- Members register with a name, Club Department, year of study, `@abes.ac.in` email, password, GitHub username, and LeetCode username. New accounts remain pending until an administrator approves them on `/dashboard`; approval can be removed there, and administrators can delete accounts.
- Email addresses are checked for the `@abes.ac.in` format, but no verification email is sent. Administrators must confirm a member's identity through the club before granting access. The first account listed in `ADMIN_EMAILS` can be created as an approved administrator.
- Passwords are hashed server-side. Sessions use opaque, `HttpOnly`, `SameSite=Lax` cookies; personal progress is scoped to the signed-in member.
- Administrators can generate a password reset link from the member dashboard. Its random token is stored only as a hash, expires in 30 minutes, works once, and revokes the member's existing sessions after use. The administrator shares the link with the member.
- A member links GitHub through the OAuth App before submitting a club solution. The verified GitHub login becomes the member's DSAvation username, replacing the signup value. Members can disconnect GitHub from DSAvation on the Account page; this does not sign them out of github.com.
- The initial admin email is listed in `ADMIN_EMAILS`. Admins can promote members to lead or admin. Leads can publish and correct Questions of the Day; admins can adjust awarded points.
- Full name and Club Department are hidden on public standings by default. Members can opt in from their account panel; otherwise standings and accepted-submission lists show only their GitHub username. Leads/admins can see the member details needed for club administration.

## Personal progress and club scoring

These are separate systems. Ticking a question in the library writes only to that member's private `personalProgress` records. It never creates a club submission, public participant entry, leaderboard point, streak, or punctuality percentage.

Approved members can view the current Question of the Day, accepted participants, assignment history, and standings. Leads/admins can publish at most one assignment for each date in Asia/Kolkata time. They can correct today's assignment; existing submissions are invalidated and their points removed so members can submit the corrected question. Leave holidays and breaks unassigned; those dates are excluded from the punctuality denominator and do not break an assignment streak.

Members submit one direct commit link per assigned date. GitHub's commit API checks that the repository belongs to the member's linked GitHub account, the GitHub author matches the linked account (GitHub web-editor commits use its web-flow committer), the commit and author dates are on the assignment day in Asia/Kolkata, and the commit adds, edits, or moves a non-empty file to `<LEETCODE_ID>/<solution-file>` (the file must contain at least one byte at that commit). A valid submission is accepted and receives one point immediately. Administrators can adjust an accepted submission from 0 to 10 points; each adjustment appears in the admin activity log. Personal question checkmarks remain private and do not affect club points.

### GitHub commit workflow

1. A lead publishes the question for the date.
2. The member links their GitHub account in DSAvation.
3. The member creates or uses a public GitHub repository they own.
4. The member keeps a non-empty solution file directly under a folder named with the assigned LeetCode question number. The submitted commit may add, edit, or move the file into that folder:

   ```text
   LEETCODE_ID/solution.ext
   ```

5. Commit and push the file during the assignment day, then paste the direct commit URL, such as `https://github.com/USERNAME/REPOSITORY/commit/FULL_SHA`.
6. DSAvation verifies the commit through GitHub and awards the point automatically. The repository must be owned by the linked GitHub account. Private repositories require a server-side `GITHUB_TOKEN` with access to that repository.

Assignment history, leaderboard, member list, submission list, and admin activity use server-side pagination. Admin and lead changes to assignments or submissions, member access and roles, reset-link generation, and elevated account actions are recorded for administrators to review.

## Data and privacy boundaries

- MongoDB stores account profiles, password hashes, hashed password-reset tokens, sessions, private progress, daily assignments, club submissions, and administrator activity records. Account deletion removes the member's sessions, reset tokens, personal progress, and club submissions.
- Only the signed-in member can read or change their personal progress through the API. Personal progress is not part of the public leaderboard.
- The curriculum and assignment details are available only to approved signed-in members. Public endpoints expose aggregate club standings; participant names follow the member's public-name preference. Email addresses and personal progress are not returned by public endpoints.
- Administrators can remove member accounts from `/dashboard`; the account's sessions, personal checkmarks, and club submissions are deleted with it. Take regular database backups before onboarding a large club.

## Tests

Run the API and feature tests with:

```powershell
npm test
```

Tests use an in-memory fake database and stub GitHub API responses; they do not require MongoDB credentials or a live GitHub token.

## Curriculum

The 220-question curriculum was curated from the overlap and recurring interview patterns in [Striver's A2Z DSA Sheet](https://takeuforward.org/prep-hub/strivers-a2z-dsa-sheet?page=sheet&open=1995%2C1997%2C2027%2C2013) and [NeetCode 250](https://neetcode.io/practice/practice/neetcode250), ordered from fundamentals to advanced topics. Complexity labels describe standard optimal interview solutions and generally exclude returned output.
