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
| `GITHUB_REPOSITORY` | Club repository in `owner/name` format. |
| `GITHUB_TOKEN` | GitHub token with read access to the club repository, required when it is private and useful for API rate limits. |
| `GITHUB_WEBHOOK_SECRET` | Secret used to authenticate GitHub push webhooks. Configure the same value in the repository webhook. |
| `SESSION_COOKIE_SECURE` | Optional; Vercel automatically marks session cookies secure over HTTPS. |

Keep Vercel's production deployment on HTTPS. After adding or changing variables, redeploy so the functions receive them. The first API request creates the required MongoDB indexes.

## Accounts and roles

- Members register with a name, department, year of study, `@abes.ac.in` email, password, and GitHub username. New accounts remain pending until an administrator approves them on `/dashboard`; approval can be removed there, and administrators can delete accounts.
- Email addresses are checked for the `@abes.ac.in` format, but no verification email is sent. Administrators must confirm a member's identity through the club before granting access. The first account listed in `ADMIN_EMAILS` can be created as an approved administrator.
- Passwords are hashed server-side. Sessions use opaque, `HttpOnly`, `SameSite=Lax` cookies; personal progress is scoped to the signed-in member.
- A member links GitHub through the OAuth App before submitting a club solution. This confirms the account behind the GitHub username collected at signup.
- The initial admin email is listed in `ADMIN_EMAILS`. Admins can promote members to lead or admin. Leads can publish Questions of the Day and review submissions.
- Full name and department are hidden on public standings by default. Members can opt in from their account panel; otherwise standings and accepted-submission lists show only their GitHub username. Leads/admins can see the member details needed for club administration.

## Personal progress and club scoring

These are separate systems. Ticking a question in the library writes only to that member's private `personalProgress` records. It never creates a club submission, public participant entry, leaderboard point, streak, or punctuality percentage.

Approved members can view the current Question of the Day, accepted participants, assignment history, and standings. Leads/admins can publish at most one assignment for each date in Asia/Kolkata time. A published date cannot be changed or assigned a second question. Leave holidays and breaks unassigned; those dates are excluded from the punctuality denominator and do not break an assignment streak.

Every member has one club submission per assigned date. The server rejects submissions for another date or question, commits outside the assignment date in Asia/Kolkata, commits by a different linked GitHub author, and files outside the expected path. New submissions wait for lead review; only accepted submissions count toward points and punctuality.

### GitHub commit workflow

1. A lead publishes the question for the date.
2. The member links their GitHub account in DSAvation.
3. The member commits the solution to the club repository under:

   ```text
   submissions/YYYY-MM-DD/GITHUB_USERNAME/lc-LEETCODE_ID/solution.ext
   ```

4. Push it to a branch named `submissions/GITHUB_USERNAME` on that same date. Configure the repository webhook below so the signed push event can confirm who pushed it.
5. The member may paste the direct commit URL in DSAvation. The API checks the repository, commit author, commit date, and changed file path with GitHub. A lead reviews the pending submission before it earns points.

Configure one GitHub repository webhook:

- Payload URL: `https://YOUR_DOMAIN/api/integrations/github/webhook`
- Content type: `application/json`
- Secret: the same value as `GITHUB_WEBHOOK_SECRET`
- Events: **Just the push event**

The webhook checks GitHub's signature, repository, branch pusher, commit author, commit timestamp, and solution path. When the webhook secret is configured, a commit-link-only submission cannot be accepted for points without a matching signed push event. GitHub webhook deliveries may be retried; duplicate member/date submissions are guarded by a unique database index.

## Data and privacy boundaries

- MongoDB stores account profiles, password hashes, sessions, private progress, daily assignments, and club submissions. Account deletion removes the member's sessions, personal progress, and club submissions.
- Only the signed-in member can read or change their personal progress through the API. Personal progress is not part of the public leaderboard.
- The curriculum and assignment details are available only to approved signed-in members. Public endpoints expose aggregate club standings; participant names follow the member's public-name preference. Email addresses and personal progress are not returned by public endpoints.
- Administrators can remove member accounts from `/dashboard`; the account's sessions, personal checkmarks, and club submissions are deleted with it. Take regular database backups before onboarding a large club.

## Curriculum

The 220-question curriculum was curated from the overlap and recurring interview patterns in [Striver's A2Z DSA Sheet](https://takeuforward.org/prep-hub/strivers-a2z-dsa-sheet?page=sheet&open=1995%2C1997%2C2027%2C2013) and [NeetCode 250](https://neetcode.io/practice/practice/neetcode250), ordered from fundamentals to advanced topics. Complexity labels describe standard optimal interview solutions and generally exclude returned output.
