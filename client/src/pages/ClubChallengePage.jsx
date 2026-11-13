import React from 'react';
import { Icon as IconifyIcon } from '@iconify/react';
import { Icon } from '../components/common/Icon.jsx';
import { Pill } from '../components/common/Pill.jsx';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';
import { formatDmy, localDay, studyYearLabel } from '../utils/dateUtils.js';

export function ClubChallengePage({
  account,
  club,
  assignedQuestion,
  clubTodayBusy,
  clubTodayLoaded,
  clubTodayError,
  retryClubToday,
  questionsBusy,
  questionsError,
  retryQuestionData,
  isAdmin,
  isLeader,
  copiedAnnouncement,
  handleCopyAnnouncement,
  isLeetcodeApproved,
  submissions,
  submissionsBusy,
  submissionsError,
  retryOwnSubmissions,
  submissionHelpOpen,
  setSubmissionHelpOpen,
  submitClubSolution,
  commitUrl,
  setCommitUrl,
  submissionBusy,
  submitLeetCodeSolution,
  navigate,
  editingTodayAssignment,
  deleteTodayAssignment,
  assignmentBusy,
  publishAssignment,
  assignmentDate,
  setAssignmentDate,
  assignmentQuestion,
  setAssignmentQuestion,
  questions,
  history,
  selectedExplainer,
  openMessageModal,
  handlePickRandomExplainer,
  pickExplainerBusy,
  openRepickModal,
  pending,
  memberBusy,
  review,
  pendingPagination,
  pendingBusy,
  refreshPendingSubmissions,
  historyPagination,
  byId,
  clubLocked,
  clubActivity,
  clubActivityBusy,
  clubActivityLoaded,
  clubActivityError,
  retryClubActivity,
  historyBusy,
  historyLoaded,
  historyError,
  loadHistoryPage,
  setExportStudyYear,
  setExportModalOpen,
  todaySubmissionsData,
  refreshLeaderboardData,
  refreshingLeaderboard,
  leaderboardScope,
  setLeaderboardScope,
  currentUserRank,
  leaderboard,
  leaderboardPagination,
  leaderboardBusy,
  leaderboardLoaded,
  leaderboardError,
  loadLeaderboardPage,
  setAuthMode,
  setAuthOpen,
}) {
  return (
    <main className="content-shell page-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            SHARED CLUB CHALLENGE
          </div>
          <h1>
            Show up. Ship a solution<span>.</span>
          </h1>
        </div>
        <div className="club-date-badge">
          <IconifyIcon icon="griddy-icons:calendar-date" width={18} height={18} />
          <strong>{formatDmy(club?.dateKey || localDay())}</strong>
        </div>
      </div>
      {account ? (
        <div className="club-grid">
          <div className="club-main-column">
            <section className="panel qotd-panel">
              <div className="card-fluid-mesh" aria-hidden="true">
                <span className="fluid-blob fluid-blob-1" />
                <span className="fluid-blob fluid-blob-2" />
                <span className="fluid-blob fluid-blob-3" />
                <span className="fluid-shimmer-sweep" />
              </div>
              <div className="qotd-panel-content">
                <div className="panel-header">
                  <div>
                    <div className="eyebrow">
                      <span className="eyebrow-line" />
                      TODAY'S ASSIGNMENT
                    </div>
                    <h2>
                      {assignedQuestion?.title || (club?.assignment
                        ? questionsBusy
                          ? 'Loading question details…'
                          : `LeetCode #${club.assignment.questionId}`
                        : !clubTodayLoaded || clubTodayBusy
                          ? 'Loading today’s assignment…'
                          : clubTodayError
                            ? 'Today’s assignment is unavailable'
                            : 'No assignment today')}
                    </h2>
                  </div>
                  <div className="panel-heading-actions">
                    {assignedQuestion && (
                      <Pill tone={assignedQuestion.difficulty.toLowerCase()}>{assignedQuestion.difficulty}</Pill>
                    )}
                  </div>
                </div>
                {assignedQuestion ? (
                  <>
                    <div className="assignment-meta">
                      <span>LeetCode #{assignedQuestion.id}</span>
                      <span>{assignedQuestion.topic}</span>
                      <span>{assignedQuestion.pattern}</span>
                      {(isAdmin || isLeader) && (
                        <button
                          type="button"
                          className={`assignment-copy-btn ${copiedAnnouncement ? 'copied' : ''}`}
                          onClick={handleCopyAnnouncement}
                          title="Copy Daily Challenge announcement text"
                          aria-label="Copy Daily Challenge announcement text"
                        >
                          <Icon name={copiedAnnouncement ? 'check' : 'copy'} size={13} />
                        </button>
                      )}
                    </div>
                    <p className="assignment-prompt">
                      Submit today’s verified solution{' '}
                      {isLeetcodeApproved && account?.defaultSubmissionMethod === 'leetcode' ? (
                        <>
                          directly via <strong>LeetCode</strong>
                        </>
                      ) : (
                        <>
                          using your <strong>GitHub commit</strong>
                        </>
                      )}
                      .
                    </p>
                    <div className="assignment-counts">
                      <div>
                        <strong>{club?.acceptedCount || 0}</strong>
                        <span>ACCEPTED</span>
                      </div>
                      <a
                        href={`https://leetcode.com/problems/${assignedQuestion.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open on LeetCode <Icon name="external" size={13} />
                      </a>
                    </div>
                    {!account ? (
                      <div className="inline-callout">
                        <Icon name="lock" size={16} />
                        <span>Sign in with an approved account to submit a club solution.</span>
                        <button
                          onClick={() => {
                            setAuthMode('login');
                            setAuthOpen(true);
                          }}
                        >
                          Sign in
                        </button>
                      </div>
                    ) : submissionsBusy ? (
                      <div className="inline-callout" role="status">
                        <IconifyIcon icon="charm:refresh" width={14} height={14} className="spin-icon" />
                        <span>Checking your submission status…</span>
                      </div>
                    ) : submissionsError && !submissionsLoaded ? (
                      <div className="inline-callout" role="alert">
                        <span>Could not check your submission: {submissionsError}</span>
                        <button onClick={retryOwnSubmissions}>Retry</button>
                      </div>
                    ) : submissions.some(
                      (item) => item.assignment?.dateKey === club?.assignment?.dateKey && item.status !== 'invalidated'
                    ) ? (
                      <div className="inline-callout submitted">
                        <Icon name="check" size={16} />
                        <span>
                          Your submission for today is{' '}
                          {
                            submissions.find(
                              (item) => item.assignment?.dateKey === club?.assignment?.dateKey && item.status !== 'invalidated'
                            )?.status
                          }{' '}
                          ·{' '}
                          {
                            submissions.find(
                              (item) => item.assignment?.dateKey === club?.assignment?.dateKey && item.status !== 'invalidated'
                            )?.points ?? 0
                          }{' '}
                          point(s).
                        </span>
                      </div>
                    ) : (
                      <div className="submission-box-wrap">
                        {!(isLeetcodeApproved && account?.defaultSubmissionMethod === 'leetcode') ? (
                          !account.githubVerified ? (
                            <div className="inline-callout">
                              <Icon name="github" size={15} />
                              <span>
                                Connect the GitHub account you want to use; its verified username will replace the signup value.
                              </span>
                              <button
                                onClick={() => {
                                  window.location.href = '/api/auth/github/start';
                                }}
                              >
                                Link GitHub
                              </button>
                            </div>
                          ) : (
                            <form className="submission-form" onSubmit={submitClubSolution}>
                              <div className="submission-form-heading">
                                <label htmlFor="commit-url">GITHUB COMMIT CODE OR FULL URL</label>
                                <button
                                  className="submission-info"
                                  type="button"
                                  aria-label="How to submit a solution"
                                  aria-expanded={submissionHelpOpen}
                                  aria-controls="submission-help"
                                  onClick={() => setSubmissionHelpOpen((open) => !open)}
                                >
                                  <Icon name="info" size={13} />
                                </button>
                              </div>
                              {submissionHelpOpen && (
                                <div className="submission-help" id="submission-help">
                                  <strong>Before you submit</strong>
                                  <ol>
                                    <li>
                                      Create or use a public repository that you own under <code>@{account.githubUsername}</code>.
                                    </li>
                                    <li>
                                      Create or update <code>{assignedQuestion.id}/solution.txt</code> (or <code>.cpp</code>,{' '}
                                      <code>.py</code>, <code>.java</code>, <code>.js</code>, <code>.c</code>) directly inside the
                                      question folder. The file can contain any language, but must have at least one byte.
                                    </li>
                                    <li>
                                      Commit and push it during today’s assignment date. The GitHub author must match your linked
                                      account; commits made in GitHub's web editor use its web-flow committer and are accepted.
                                    </li>
                                    <li>
                                      Enter either your commit code/hash (e.g. <code>76c3f95</code>) or your full commit URL (e.g.{' '}
                                      <code>
                                        https://github.com/{account.githubUsername}/YOUR-REPO/commit/FULL_SHA
                                      </code>
                                      ).
                                    </li>
                                  </ol>
                                  <p>Only the first valid submission for today earns a point. Admins can adjust points if needed.</p>
                                </div>
                              )}
                              <div className="submission-input-row">
                                <input
                                  id="commit-url"
                                  type="text"
                                  required
                                  value={commitUrl}
                                  onChange={(event) => setCommitUrl(event.target.value)}
                                  placeholder={`e.g. 76c3f95 or https://github.com/${account.githubUsername}/REPO/commit/FULL_SHA`}
                                />
                                <button className="button button-dark" disabled={submissionBusy}>
                                  {submissionBusy ? 'Verifying…' : 'Verify and submit'} <Icon name="arrow" size={13} />
                                </button>
                              </div>
                            </form>
                          )
                        ) : !account.leetcodeUsername ? (
                          <div className="inline-callout">
                            <Icon name="info" size={15} />
                            <span>
                              Your LeetCode username is not added yet. Add it in your Account profile to submit directly.
                            </span>
                            <button type="button" onClick={() => navigate('progress')}>
                              Go to Account
                            </button>
                          </div>
                        ) : (
                          <div className="leetcode-direct-box">
                            <div className="leetcode-direct-meta">
                              <span className="leetcode-user-tag">
                                <IconifyIcon icon="bxl:leetcode" width={14} height={14} />
                                LeetCode: <strong>@{account.leetcodeUsername}</strong>
                              </span>
                            </div>
                            <p>
                              Solve <strong>{assignedQuestion.title}</strong> on LeetCode under{' '}
                              <strong>@{account.leetcodeUsername}</strong> and obtain an <strong>Accepted</strong> status{' '}
                              <strong>today</strong>.<br /> Once submitted on LeetCode, click below to verify directly and award your
                              club point.
                            </p>
                            <div className="leetcode-direct-actions">
                              <button
                                type="button"
                                className="leetcode-submit-button"
                                disabled={submissionBusy}
                                onClick={submitLeetCodeSolution}
                              >
                                {submissionBusy ? (
                                  'Verifying on LeetCode…'
                                ) : (
                                  <>
                                    Verify & Submit
                                    <Icon name="arrow" size={13} />
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="no-assignment-note">
                    {!clubTodayLoaded || clubTodayBusy ? (
                      <p role="status">Loading today’s assignment…</p>
                    ) : clubTodayError ? (
                      <>
                        <p role="alert">Could not load today’s assignment: {clubTodayError}</p>
                        <button className="button button-quiet" onClick={retryClubToday}>Retry</button>
                      </>
                    ) : club?.assignment ? (
                      <>
                        <p role={questionsError ? 'alert' : 'status'}>
                          {questionsError
                            ? `Question details could not be loaded: ${questionsError}`
                            : `Loading details for LeetCode #${club.assignment.questionId}…`}
                        </p>
                        {questionsError && <button className="button button-quiet" onClick={retryQuestionData}>Retry</button>}
                      </>
                    ) : (
                      <p>
                        A club lead has not assigned a question for this date. Unassigned holidays and breaks are excluded from
                        punctuality calculations.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>

            {isLeader && (
              <section className="panel leader-panel">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">
                      <span className="eyebrow-line" />
                      LEAD TOOLS
                    </div>
                    <h2>{editingTodayAssignment ? 'Change today’s question' : 'Publish a Question of the Day'}</h2>
                  </div>
                  <div className="panel-heading-actions">
                    <Pill tone="green">{account.role}</Pill>
                    {editingTodayAssignment && club?.assignment && (
                      <button
                        type="button"
                        className="button button-danger delete-today-btn"
                        onClick={deleteTodayAssignment}
                        disabled={assignmentBusy}
                        title="Delete today’s published question"
                      >
                        <Icon name="trash" size={13} /> <span>Delete today's question</span>
                      </button>
                    )}
                  </div>
                </div>
                <form className="publish-form" onSubmit={publishAssignment}>
                  <label>
                    <span>ASSIGNMENT DATE</span>
                    <input
                      type="date"
                      value={assignmentDate}
                      min={localDay()}
                      onChange={(event) => setAssignmentDate(event.target.value)}
                      required
                    />
                  </label>
                  <label className="wide">
                    <span>QUESTION</span>
                    <select
                      value={assignmentQuestion}
                      onChange={(event) => setAssignmentQuestion(event.target.value)}
                      required
                    >
                      <option value="">Choose from the 220 question curriculum</option>
                      {questions.map((question) => (
                        <option key={question.id} value={question.id}>
                          Day {String(question.day).padStart(3, '0')} · LC {question.id} · {question.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button button-green"
                    disabled={
                      assignmentBusy ||
                      !assignmentQuestion ||
                      (editingTodayAssignment &&
                        assignmentDate === localDay() &&
                        Number(assignmentQuestion) === Number(club?.assignment?.questionId)) ||
                      (!editingTodayAssignment && history.some((item) => item.dateKey === assignmentDate))
                    }
                  >
                    {assignmentBusy
                      ? 'Saving…'
                      : editingTodayAssignment && assignmentDate === localDay()
                        ? 'Replace today’s question'
                        : 'Publish assignment'}{' '}
                    <Icon name="arrow" size={14} />
                  </button>
                </form>
                <p className="helper-copy">
                  {editingTodayAssignment && assignmentDate === localDay()
                    ? 'Changing today’s question invalidates existing submissions, removes their points, and lets members submit the corrected question.'
                    : history.some((item) => item.dateKey === assignmentDate)
                      ? 'A question is already published for this date.'
                      : 'Publish at most one question per date. Leave holidays and breaks unassigned.'}
                </p>
              </section>
            )}

            {isLeader && (
              <section className="panel moderation-tools-panel">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">
                      <span className="eyebrow-line" />
                      EXPLAINER
                    </div>
                    <h2>Today's Explainer</h2>
                  </div>
                  <div className="panel-heading-actions">
                    {(club?.assignment?.explainer || selectedExplainer) && (
                      <button
                        type="button"
                        className="assignment-copy-btn explainer-copy-head-btn"
                        onClick={() => openMessageModal('explainer')}
                        title="Open & copy evening solution breakdown message"
                        aria-label="Copy evening breakdown message"
                        style={{ color: '#000000' }}
                      >
                        <Icon name="copy" size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="button button-green pick-explainer-head-btn"
                      onClick={handlePickRandomExplainer}
                      disabled={!club?.assignment || pickExplainerBusy}
                      title={
                        club?.assignment?.explainer
                          ? "View today's selected explainer share card"
                          : "Select an explainer for today's question via Randomized Round Robin"
                      }
                    >
                      <IconifyIcon icon="andrsrxn:eye-scan" width={14} height={14} />{' '}
                      <span>{club?.assignment?.explainer ? 'View Share Card' : 'Pick Explainer'}</span>
                    </button>
                    {!club?.assignment?.explainer && (
                      <button
                        type="button"
                        className="button button-quiet pick-custom-head-btn"
                        onClick={openRepickModal}
                        disabled={!club?.assignment || pickExplainerBusy}
                        title="Manually select an explainer from the 2nd-year cohort"
                      >
                        <Icon name="users" size={13} /> <span>Custom Pick</span>
                      </button>
                    )}
                  </div>
                </div>

                {club?.assignment?.explainer && (
                  <div className="explainer-locked-banner">
                    <div className="explainer-banner-info">
                      <MemberAvatar person={club.assignment.explainer} label="" />
                      <div>
                        <div className="explainer-banner-badge">
                          <IconifyIcon icon="andrsrxn:eye-scan" width={13} height={13} /> TODAY'S SELECTED EXPLAINER
                        </div>
                        <strong>{club.assignment.explainer.name}</strong>
                        <p>
                          {club.assignment.explainer.department} · {studyYearLabel(club.assignment.explainer.studyYear)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="button button-quiet repick-banner-btn"
                      onClick={openRepickModal}
                      disabled={pickExplainerBusy}
                      title="Re-pick another explainer and restore current member's turn"
                    >
                      <IconifyIcon icon="charm:refresh" width={14} height={14} /> <span>Re-pick</span>
                    </button>
                  </div>
                )}

                {pending.length > 0 && (
                  <div className="moderation-subsection">
                    <div className="moderation-subheading">
                      <strong>Pending review ({pending.length})</strong>
                    </div>
                    <div className="review-list">
                      {pending.map((item) => (
                        <article className="review-item" key={item.id}>
                          <div>
                            <strong>
                              {item.member?.name || 'Member'}{' '}
                              <span>· Club Department: {item.member?.department || '—'}</span>
                            </strong>
                            <p>
                              {item.assignment?.dateKey} · LC {item.assignment?.questionId} · {item.assignment?.question}
                            </p>
                            <div className="review-evidence">
                              {item.verifiedPusher ? (
                                <Pill tone="green">PUSH VERIFIED</Pill>
                              ) : (
                                <Pill tone="amber">COMMIT LINK ONLY</Pill>
                              )}
                              <a href={item.commitUrl} target="_blank" rel="noreferrer">
                                Review commit <Icon name="external" size={13} />
                              </a>
                            </div>
                          </div>
                          <div className="review-actions">
                            <button
                              className="button button-quiet"
                              disabled={memberBusy === item.id}
                              onClick={() => review(item, 'rejected')}
                            >
                              Decline
                            </button>
                            <button
                              className="button button-green"
                              disabled={memberBusy === item.id}
                              onClick={() => review(item, 'accepted')}
                            >
                              Accept <Icon name="check" size={14} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    {pendingPagination.totalPages > 1 && (
                      <div className="pagination-controls">
                        <button
                          className="button button-quiet"
                          disabled={pendingBusy || pendingPagination.page <= 1}
                          onClick={() => refreshPendingSubmissions(pendingPagination.page - 1)}
                        >
                          {pendingBusy ? (
                            <>
                              <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Previous
                            </>
                          ) : (
                            'Previous'
                          )}
                        </button>
                        <span>
                          Page {pendingPagination.page} of {pendingPagination.totalPages}
                        </span>
                        <button
                          className="button button-quiet"
                          disabled={pendingBusy || pendingPagination.page >= pendingPagination.totalPages}
                          onClick={() => refreshPendingSubmissions(pendingPagination.page + 1)}
                        >
                          {pendingBusy ? (
                            <>
                              <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Next
                            </>
                          ) : (
                            'Next'
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            <section className="panel history-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" />
                    ASSIGNMENT LOG
                  </div>
                  <h2>Published days</h2>
                </div>
                <span className="micro-count">{historyLoaded ? historyPagination.total : '—'}</span>
              </div>
              {!historyLoaded && historyError ? (
                <div className="soft-empty" role="alert">
                  <span>Assignment history could not be loaded: {historyError}</span>
                  <button className="button button-quiet" onClick={() => loadHistoryPage(historyPagination.page)}>Retry</button>
                </div>
              ) : !historyLoaded || (historyBusy && !history.length) ? (
                <div className="soft-empty" role="status">Loading assignment history…</div>
              ) : !clubActivityLoaded ? (
                clubActivityBusy ? (
                  <div className="soft-empty" role="status">Loading completion records…</div>
                ) : (
                  <div className="soft-empty" role="alert">
                    <span>Completion records could not be loaded: {clubActivityError}</span>
                    <button className="button button-quiet" onClick={retryClubActivity}>Retry</button>
                  </div>
                )
              ) : history.length ? (
                <>
                  <div className="history-list">
                    {history.map((item) => {
                      const question = byId.get(Number(item.questionId));
                      const completed = Boolean(clubLocked[item.questionId] || clubActivity[item.questionId]);
                      return (
                        <div className={`history-row ${completed ? 'is-club-complete' : ''}`} key={item.id}>
                          <span className="history-date">
                            {item.dateKey ? item.dateKey.split('-').slice(1).reverse().join('-') : ''}
                          </span>
                          <span className="history-title">
                            {question?.title || `LeetCode #${item.questionId}`}
                          </span>
                          <span className="history-mark">
                            {completed && (
                              <span className="history-club-check" title="Completed in a Club Challenge">
                                <Icon name="check" size={13} />
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pagination-controls" aria-label="Assignment log pages">
                    <button
                      className="button button-quiet"
                      disabled={historyBusy || historyPagination.page <= 1}
                      onClick={() => loadHistoryPage(historyPagination.page - 1)}
                    >
                      {historyBusy ? (
                        <>
                          <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Previous
                        </>
                      ) : (
                        'Previous'
                      )}
                    </button>
                    <span>
                      Page {historyPagination.page} of {historyPagination.totalPages}
                    </span>
                    <button
                      className="button button-quiet"
                      disabled={historyBusy || historyPagination.page >= historyPagination.totalPages}
                      onClick={() => loadHistoryPage(historyPagination.page + 1)}
                    >
                      {historyBusy ? (
                        <>
                          <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Next
                        </>
                      ) : (
                        'Next'
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="soft-empty">No questions have been assigned yet.</div>
              )}
            </section>
          </div>

          <aside className="club-side-column">
            <section className="panel leaderboard-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" />
                    CLUB STANDINGS
                  </div>
                  <h2>
                    <Icon name="trophy" size={18} /> Leaderboard
                  </h2>
                </div>
                <div className="panel-heading-actions">
                  {isLeader && (
                    <button
                      type="button"
                      className="button button-quiet export-csv-btn"
                      onClick={() => {
                        setExportStudyYear('second-year');
                        setExportModalOpen(true);
                      }}
                      disabled={!club?.assignment && !todaySubmissionsData.questionId}
                      title="Export today's question activity report as CSV"
                    >
                      <Icon name="download" size={14} /> <span>Export as .CSV</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-quiet leaderboard-refresh-btn"
                    onClick={refreshLeaderboardData}
                    disabled={refreshingLeaderboard}
                    title="Refresh leaderboard"
                    aria-label="Refresh leaderboard"
                  >
                    <IconifyIcon
                      icon="charm:refresh"
                      width={16}
                      height={16}
                      className={refreshingLeaderboard ? 'spin-icon' : ''}
                    />
                  </button>
                </div>
              </div>

              <div className="leaderboard-scope-toggle">
                <button
                  type="button"
                  className={`scope-toggle-btn ${leaderboardScope === 'daily' ? 'active' : ''}`}
                  onClick={() => setLeaderboardScope('daily')}
                >
                  Daily
                </button>
                <button
                  type="button"
                  className={`scope-toggle-btn ${leaderboardScope === 'overall' ? 'active' : ''}`}
                  onClick={() => setLeaderboardScope('overall')}
                >
                  Overall
                </button>
              </div>

              {leaderboardScope === 'daily' ? (
                <>
                  <p className="leaderboard-note"></p>
                  {!clubTodayLoaded || clubTodayBusy ? (
                    <div className="soft-empty" role="status">Loading today’s standings…</div>
                  ) : clubTodayError ? (
                    <div className="soft-empty" role="alert">Today’s standings are unavailable: {clubTodayError}</div>
                  ) : club?.dailyLeaderboard?.length ? (
                    <div className="leaderboard-list">
                      {club.dailyLeaderboard.map((person, index) => {
                        const rank = index + 1;
                        const isTopThree = rank <= 3;
                        const submittedTimeStr = person.submittedAt
                          ? new Date(person.submittedAt).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Asia/Kolkata',
                          }) + ' IST'
                          : '';
                        const isLeetCode =
                          person.submissionType === 'leetcode' ||
                          String(person.commitUrl || '').includes('leetcode.com');
                        const leetcodeUser = person.leetcodeUsername || '';
                        const targetUrl = isLeetCode
                          ? leetcodeUser
                            ? `https://leetcode.com/u/${encodeURIComponent(leetcodeUser)}/`
                            : person.commitUrl || 'https://leetcode.com'
                          : person.commitUrl ||
                          (person.githubUsername
                            ? `https://github.com/${encodeURIComponent(person.githubUsername)}`
                            : '');

                        return (
                          <div
                            className={`leaderboard-row daily-leaderboard-row ${isTopThree ? `top-three-row top-rank-${rank}` : ''}`}
                            key={`${person.userId || person.name}:${rank}`}
                          >
                            {isTopThree ? (
                              <div className={`rank-badge-wrap rank-badge-${rank}`} title={`Rank #${rank}`}>
                                <span className="rank-num">{rank}</span>
                              </div>
                            ) : (
                              <span className="rank">{String(rank).padStart(2, '0')}</span>
                            )}
                            <MemberAvatar person={person} label="" />
                            <div className="leader-person">
                              <strong>
                                {(isAdmin || isLeader) && targetUrl ? (
                                  <span
                                    className="leader-person-clickable"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(targetUrl, '_blank', 'noopener,noreferrer');
                                    }}
                                    title={
                                      isLeetCode
                                        ? `Open ${person.name}'s LeetCode profile`
                                        : `Open ${person.name}'s verified GitHub commit`
                                    }
                                  >
                                    {person.name}
                                  </span>
                                ) : (
                                  person.name
                                )}
                              </strong>
                              <span>
                                {person.department || 'Club Member'}
                                {submittedTimeStr ? ` · ${submittedTimeStr}` : ''}
                              </span>
                            </div>
                            <div className="daily-leader-actions">
                              {(person.blaze !== undefined || person.aura !== undefined) && (
                                <span className="daily-aura-badge" title="Daily Blaze earned">
                                  <IconifyIcon icon="at-icons:fire" width={12} height={12} />{' '}
                                  {person.blaze ?? person.aura}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="soft-empty">
                      {!club?.assignment
                        ? 'No Question of the Day published for today.'
                        : 'No accepted solutions submitted for today yet. Be the first to solve!'}
                    </div>
                  )}
                </>
              ) : (() => {
                const userOverallRank =
                  currentUserRank ||
                  (account
                    ? (() => {
                      const idx = leaderboard.findIndex(
                        (p) =>
                          (p.userId && p.userId === account.id) ||
                          (account.githubUsername &&
                            p.githubUsername?.toLowerCase() === account.githubUsername?.toLowerCase())
                      );
                      if (idx !== -1)
                        return (leaderboardPagination.page - 1) * leaderboardPagination.pageSize + idx + 1;
                      return null;
                    })()
                    : null);
                return (
                  <>
                    <p className="leaderboard-note">
                      {account && (
                        <span className="user-rank-highlight" title="Your current overall club rank">
                          Your rank: <strong>#{userOverallRank ?? '—'}</strong>
                        </span>
                      )}
                    </p>
                    {leaderboard.length ? (
                      <>
                        <div className="leaderboard-list">
                          {leaderboard.map((person, index) => {
                            const rank =
                              (leaderboardPagination.page - 1) * leaderboardPagination.pageSize + index + 1;
                            return (
                              <div
                                className="leaderboard-row"
                                key={`${person.githubUsername || person.name}:${rank}`}
                              >
                                <span className={`rank ${rank <= 3 ? `rank-${rank}` : ''}`}>
                                  {String(rank).padStart(2, '0')}
                                </span>
                                <MemberAvatar person={person} label="" />
                                <div className="leader-person">
                                  <strong>
                                    {person.name}
                                    {person.role === 'admin' && (
                                      <span className="admin-verified-badge" title="Administrator">
                                        <IconifyIcon icon="codicon:verified" width={16} height={16} />
                                      </span>
                                    )}
                                  </strong>
                                  <span>
                                    {person.department} · {person.punctuality}% punctuality
                                  </span>
                                </div>
                                <div className="leader-score-cell">
                                  {person.blaze !== undefined || person.aura !== undefined ? (
                                    <span className="daily-aura-badge overall-blaze-badge" title="Total Blaze points">
                                      <IconifyIcon icon="at-icons:fire" width={12} height={12} />
                                      <span className="blaze-digits">{person.blaze ?? person.aura}</span>
                                    </span>
                                  ) : (
                                    <span className="overall-blaze-placeholder" aria-hidden="true" />
                                  )}
                                  <span className="leader-score overall-normal-score" title="Curriculum points">
                                    {person.points ?? 0} pts
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="pagination-controls" aria-label="Leaderboard pages">
                          <button
                            className="button button-quiet"
                            disabled={leaderboardBusy || leaderboardPagination.page <= 1}
                            onClick={() => loadLeaderboardPage(leaderboardPagination.page - 1)}
                          >
                            {leaderboardBusy ? (
                              <>
                                <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Previous
                              </>
                            ) : (
                              'Previous'
                            )}
                          </button>
                          <span>
                            Page {leaderboardPagination.page} of {leaderboardPagination.totalPages}
                          </span>
                          <button
                            className="button button-quiet"
                            disabled={leaderboardBusy || leaderboardPagination.page >= leaderboardPagination.totalPages}
                            onClick={() => loadLeaderboardPage(leaderboardPagination.page + 1)}
                          >
                            {leaderboardBusy ? (
                              <>
                                <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Next
                              </>
                            ) : (
                              'Next'
                            )}
                          </button>
                        </div>
                      </>
                    ) : !leaderboardLoaded && leaderboardError ? (
                      <div className="soft-empty" role="alert">
                        <span>Overall standings could not be loaded: {leaderboardError}</span>
                        <button className="button button-quiet" onClick={() => loadLeaderboardPage(leaderboardPagination.page)}>Retry</button>
                      </div>
                    ) : !leaderboardLoaded || leaderboardBusy ? (
                      <div className="soft-empty" role="status">Loading overall standings…</div>
                    ) : (
                      <div className="soft-empty">No scored club submissions yet. Be first to get on the board.</div>
                    )}
                  </>
                );
              })()}
            </section>
          </aside>
        </div>
      ) : (
        <div className="library-locked panel">
          <span className="prompt-icon">
            <Icon name="lock" size={23} />
          </span>
          <div>
            <h2>Sign in to view club questions and activity.</h2>
            <p>Approved club members can view the current assignment, history, and standings.</p>
          </div>
          <button
            className="button button-dark"
            onClick={() => {
              setAuthMode('login');
              setAuthOpen(true);
            }}
          >
            Sign in <Icon name="arrow" size={14} />
          </button>
        </div>
      )}
      <footer className="site-footer">
        <span>DSAvation</span>
        <span>Technovation – The Networking Club</span>
      </footer>
    </main>
  );
}
