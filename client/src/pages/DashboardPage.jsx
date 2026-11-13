import React from 'react';
import { Icon as IconifyIcon } from '@iconify/react';
import { Icon } from '../components/common/Icon.jsx';
import { Pill } from '../components/common/Pill.jsx';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';
import { AdminSubmissionsHeatmap } from '../components/dashboard/AdminSubmissionsHeatmap.jsx';
import { HeatmapDayModal } from '../components/dashboard/HeatmapDayModal.jsx';
import { studyYearLabel } from '../utils/dateUtils.js';

export function DashboardPage({
  isAdmin,
  account,
  memberFilter,
  setMemberFilter,
  heatmapSecondYearOnly,
  setHeatmapSecondYearOnly,
  submissionHeatmapBusy,
  submissionHeatmapLoaded,
  submissionHeatmapError,
  membersBusy,
  membersError,
  loadSubmissionHeatmap,
  refreshMembers,
  membersPagination,
  submissionHeatmapCounts,
  submissionHeatmapSecondYearCounts,
  memberCounts,
  memberQuery,
  setMemberQuery,
  displayedMembers,
  openHeatmapDay,
  handleDownloadMonthCsv,
  memberBusy,
  setMemberApproval,
  deleteMember,
  setMemberLeetcodeApproval,
  acceptedSubmissionsOpen,
  setAcceptedSubmissionsOpen,
  scoredBusy,
  scoredError,
  refreshScoredSubmissions,
  scoredPagination,
  scoredSubmissions,
  adjustPoints,
  auditCardOpen,
  setAuditCardOpen,
  activityPagination,
  activityBusy,
  activityError,
  refreshActivity,
  activity,
  rateLimitCount,
  rateLimitBusy,
  clearAllRateLimits,
  heatmapDayModal,
  closeHeatmapDayModal,
  navigateHeatmapDay,
  isHeatmapPrevDisabled,
  isHeatmapNextDisabled,
  heatmapDayBusy,
  heatmapDatePickerRef,
  MIN_HEATMAP_DATE,
  todayDateKey,
  heatmapDayData,
}) {
  if (!isAdmin) return null;

  return (
    <main className="content-shell page-content dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            ADMINISTRATION
          </div>
          <h1>
            Admin Dashboard<span>.</span>
          </h1>
        </div>
      </div>
      <section className="panel dashboard-members-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              CLUB ACTIVITY
            </div>
            <h2>Club accounts</h2>
          </div>
          <div className="panel-heading-actions">
            {memberFilter === 'heatmap' && (
              <button
                type="button"
                className={`button button-quiet heatmap-year-toggle-btn ${heatmapSecondYearOnly ? 'active' : ''}`}
                onClick={() => setHeatmapSecondYearOnly((prev) => !prev)}
                title={
                  heatmapSecondYearOnly
                    ? 'Showing second year data only (Click to show all members)'
                    : 'Filter heatmap: Show second year data only'
                }
                aria-pressed={heatmapSecondYearOnly}
              >
                <IconifyIcon
                  icon={heatmapSecondYearOnly ? 'charm:circle-tick' : 'charm:filter'}
                  width={14}
                  height={14}
                />
                <span>{heatmapSecondYearOnly ? '2nd Year Only' : '2nd Year'}</span>
              </button>
            )}
            <button
              className="button button-quiet refresh-members"
              disabled={memberFilter === 'heatmap' ? submissionHeatmapBusy : membersBusy}
              title={memberFilter === 'heatmap' ? 'Refresh heatmap' : 'Refresh accounts'}
              aria-label={memberFilter === 'heatmap' ? 'Refresh heatmap' : 'Refresh accounts'}
              onClick={() => {
                if (memberFilter === 'heatmap') {
                  loadSubmissionHeatmap();
                } else {
                  refreshMembers(membersPagination.page);
                }
              }}
            >
              <IconifyIcon
                icon="charm:refresh"
                width={16}
                height={16}
                className={(memberFilter === 'heatmap' ? submissionHeatmapBusy : membersBusy) ? 'spin-icon' : ''}
              />
            </button>
          </div>
        </div>
        <div className="member-dashboard-toolbar">
          <div className="member-filter-tabs" role="tablist" aria-label="Filter member accounts">
            <button
              type="button"
              role="tab"
              aria-selected={memberFilter === 'heatmap'}
              className={`member-heatmap-tab ${memberFilter === 'heatmap' ? 'active selected' : ''}`}
              onClick={() => {
                setMemberFilter('heatmap');
                if (Object.keys(submissionHeatmapCounts).length === 0) loadSubmissionHeatmap();
              }}
            >
              <IconifyIcon icon="griddy-icons:calendar-date" width={13} height={13} />
              <span>Heatmap</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={memberFilter === 'pending'}
              className={memberFilter === 'pending' ? 'selected' : ''}
              onClick={() => {
                setMemberFilter('pending');
                refreshMembers(1, 'pending', memberQuery);
              }}
            >
              Pending · {memberCounts.pending || 0}
            </button>
          </div>
          {memberFilter === 'pending' && (
            <label className="member-search">
              <Icon name="search" size={15} />
              <input
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') refreshMembers(1, memberFilter, event.currentTarget.value);
                }}
                placeholder="Search name, email, Club Department"
              />
            </label>
          )}
        </div>

        {memberFilter === 'heatmap' ? (
          <div className="admin-embedded-heatmap-wrap">
            {submissionHeatmapBusy && !submissionHeatmapLoaded ? (
              <div className="admin-heatmap-loading">
                <span>Loading heatmap…</span>
              </div>
            ) : submissionHeatmapError && !submissionHeatmapLoaded ? (
              <div className="admin-heatmap-loading" role="alert">
                <span>{submissionHeatmapError}</span>
                <button className="button button-quiet" onClick={loadSubmissionHeatmap}>Retry</button>
              </div>
            ) : (
              <>
                {submissionHeatmapError && (
                  <div className="soft-empty" role="alert">
                    {submissionHeatmapError} <button className="button button-quiet" onClick={loadSubmissionHeatmap}>Retry</button>
                  </div>
                )}
                <AdminSubmissionsHeatmap
                  counts={heatmapSecondYearOnly ? submissionHeatmapSecondYearCounts : submissionHeatmapCounts}
                  secondYearOnly={heatmapSecondYearOnly}
                  onDayClick={openHeatmapDay}
                  onDownloadMonthCsv={handleDownloadMonthCsv}
                />
              </>
            )}
          </div>
        ) : (
          <>
            {membersBusy && !displayedMembers.length ? (
              <div className="soft-empty" role="status">Loading member accounts…</div>
            ) : membersError && !displayedMembers.length ? (
              <div className="soft-empty" role="alert">
                {membersError} <button className="button button-quiet" onClick={() => refreshMembers(membersPagination.page)}>Retry</button>
              </div>
            ) : displayedMembers.length ? (
              <div className="dashboard-member-list">
                {displayedMembers.map((member) => (
                  <article className="dashboard-member-row" key={member.id}>
                    <MemberAvatar person={member} label="" />
                    <div className="dashboard-member-identity">
                      <div className="member-name-line">
                        <strong>{member.name}</strong>
                        <Pill tone={member.approvalStatus === 'approved' ? 'green' : 'amber'}>
                          {member.approvalStatus === 'approved' ? 'Approved' : 'Pending'}
                        </Pill>
                        {member.leetcodeApproval === 'approved' && <Pill tone="green">LC Approved</Pill>}
                        {member.leetcodeApproval === 'pending' && (
                          <Pill tone="amber">
                            <Icon name="leetcode" size={12} /> LeetCode Req
                          </Pill>
                        )}
                      </div>
                      <span>{member.email}</span>
                      <small>
                        Club Department: {member.department} · {studyYearLabel(member.studyYear)} · GitHub @
                        {member.githubUsername || '—'} · LeetCode @{member.leetcodeUsername || '—'}
                      </small>
                      <small>
                        Joined{' '}
                        {member.createdAt
                          ? new Date(member.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'Asia/Kolkata',
                          })
                          : 'date unavailable'}
                      </small>
                    </div>
                    <div className="dashboard-member-actions">
                      {member.approvalStatus !== 'approved' && (
                        <>
                          <button
                            className="button button-green"
                            disabled={memberBusy === member.id}
                            onClick={() => setMemberApproval(member, 'approved')}
                          >
                            {memberBusy === member.id ? 'Saving…' : 'Approve account'} <Icon name="check" size={14} />
                          </button>
                          <button
                            className="button button-danger"
                            disabled={memberBusy === member.id || member.id === account?.id}
                            onClick={() => deleteMember(member)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {member.leetcodeApproval === 'pending' && (
                        <>
                          <button
                            className="button button-green"
                            disabled={memberBusy === member.id}
                            onClick={() => setMemberLeetcodeApproval(member, 'approved')}
                          >
                            {memberBusy === member.id ? 'Saving…' : 'Approve LC'} <Icon name="check" size={14} />
                          </button>
                          <button
                            className="button button-quiet"
                            disabled={memberBusy === member.id}
                            onClick={() => setMemberLeetcodeApproval(member, 'none')}
                          >
                            Reject LC
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty">
                <span>{memberFilter === 'pending' && !memberQuery ? '✓' : '⌕'}</span>
                <h2>
                  {memberFilter === 'pending' && !memberQuery
                    ? 'No accounts or requests are waiting.'
                    : 'No accounts match this filter.'}
                </h2>
                <p>
                  {memberFilter === 'pending' && !memberQuery
                    ? 'New signups and LeetCode requests will appear here for review.'
                    : 'Try another name, email, or status filter.'}
                </p>
              </div>
            )}
            {membersPagination.totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  className="button button-quiet"
                  disabled={membersBusy || membersPagination.page <= 1}
                  onClick={() => refreshMembers(membersPagination.page - 1)}
                >
                  {membersBusy ? (
                    <>
                      <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Previous
                    </>
                  ) : (
                    'Previous'
                  )}
                </button>
                <span>
                  Page {membersPagination.page} of {membersPagination.totalPages} · {membersPagination.total} accounts
                </span>
                <button
                  className="button button-quiet"
                  disabled={membersBusy || membersPagination.page >= membersPagination.totalPages}
                  onClick={() => refreshMembers(membersPagination.page + 1)}
                >
                  {membersBusy ? (
                    <>
                      <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Next
                    </>
                  ) : (
                    'Next'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <section
        className={`panel dashboard-activity-panel water-glass-card ${acceptedSubmissionsOpen ? 'is-open' : 'is-collapsed'}`}
      >
        <div
          className="panel-heading"
          style={{ cursor: 'pointer' }}
          onClick={() => setAcceptedSubmissionsOpen((prev) => !prev)}
        >
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              SCORING CONTROLS
            </div>
            <h2>Accepted submissions</h2>
          </div>
          <div className="panel-heading-actions">
            <button
              className="button button-quiet card-header-refresh-btn"
              disabled={scoredBusy}
              title="Refresh submissions"
              aria-label="Refresh submissions"
              onClick={(e) => {
                e.stopPropagation();
                refreshScoredSubmissions(scoredPagination.page);
              }}
            >
              <IconifyIcon
                icon="charm:refresh"
                width={16}
                height={16}
                className={scoredBusy ? 'spin-icon' : ''}
              />
            </button>
          </div>
        </div>
        {acceptedSubmissionsOpen && (
          <>
            {scoredBusy && !scoredSubmissions.length ? (
              <div className="soft-empty" role="status">Loading scored submissions…</div>
            ) : scoredError && !scoredSubmissions.length ? (
              <div className="soft-empty" role="alert">
                {scoredError} <button className="button button-quiet" onClick={() => refreshScoredSubmissions(scoredPagination.page)}>Retry</button>
              </div>
            ) : scoredSubmissions.length ? (
              <div className="review-list">
                {scoredSubmissions.map((item) => {
                  const isLeetCode =
                    item.submissionMethod === 'leetcode' ||
                    item.verificationSource === 'leetcode-api' ||
                    String(item.solutionPath || '').startsWith('LeetCode:') ||
                    String(item.commitUrl || '').includes('leetcode.com');
                  const leetcodeUser =
                    item.member?.leetcodeUsername ||
                    item.solutionPath?.match(/@([a-zA-Z0-9_-]+)/)?.[1] ||
                    '';
                  const profileUrl = leetcodeUser
                    ? `https://leetcode.com/u/${encodeURIComponent(leetcodeUser)}/`
                    : item.commitUrl || 'https://leetcode.com';
                  const currentPoints = item.points ?? 1;

                  return (
                    <article className="review-item score-adjustment-row" key={item.id}>
                      <div>
                        <strong>
                          {item.member?.name || 'Member'}{' '}
                          <span>
                            · {item.assignment?.dateKey} · LC {item.assignment?.questionId}
                          </span>
                        </strong>
                        <p>{item.solutionPath || item.commitUrl}</p>
                        {isLeetCode ? (
                          <a href={profileUrl} target="_blank" rel="noreferrer" className="score-profile-link">
                            <Icon name="leetcode" size={13} /> View LeetCode profile <Icon name="external" size={13} />
                          </a>
                        ) : (
                          <a href={item.commitUrl} target="_blank" rel="noreferrer">
                            Open verified commit <Icon name="external" size={13} />
                          </a>
                        )}
                      </div>
                      <div className="points-stepper-control">
                        <span className="points-stepper-label">POINTS</span>
                        <div className="points-stepper-actions">
                          <button
                            type="button"
                            className="button-icon-stepper"
                            title="Decrease point by 1"
                            aria-label={`Decrease points for ${item.member?.name || 'member'}`}
                            disabled={memberBusy === item.id || currentPoints <= 0}
                            onClick={() => adjustPoints(item, Math.max(0, currentPoints - 1))}
                          >
                            <IconifyIcon icon="ant-design:minus-circle-outlined" width={18} height={18} />
                          </button>
                          <strong className="points-value-display">{currentPoints}</strong>
                          <button
                            type="button"
                            className="button-icon-stepper"
                            title="Increase point by 1"
                            aria-label={`Increase points for ${item.member?.name || 'member'}`}
                            disabled={memberBusy === item.id || currentPoints >= 10}
                            onClick={() => adjustPoints(item, Math.min(10, currentPoints + 1))}
                          >
                            <IconifyIcon icon="ant-design:plus-circle-outlined" width={18} height={18} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="soft-empty">No verified submissions have been scored yet.</div>
            )}
            {scoredPagination.totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  className="button button-quiet"
                  disabled={scoredBusy || scoredPagination.page <= 1}
                  onClick={() => refreshScoredSubmissions(scoredPagination.page - 1)}
                >
                  {scoredBusy ? (
                    <>
                      <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Previous
                    </>
                  ) : (
                    'Previous'
                  )}
                </button>
                <span>
                  Page {scoredPagination.page} of {scoredPagination.totalPages}
                </span>
                <button
                  className="button button-quiet"
                  disabled={scoredBusy || scoredPagination.page >= scoredPagination.totalPages}
                  onClick={() => refreshScoredSubmissions(scoredPagination.page + 1)}
                >
                  {scoredBusy ? (
                    <>
                      <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Next
                    </>
                  ) : (
                    'Next'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <section
        className={`panel dashboard-activity-panel water-glass-card ${auditCardOpen ? 'is-open' : 'is-collapsed'}`}
      >
        <div
          className="panel-heading"
          style={{ cursor: 'pointer' }}
          onClick={() => setAuditCardOpen((prev) => !prev)}
        >
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              ADMIN AUDIT
            </div>
            <h2>
              Admin activity <span className="count-badge">{activityPagination.total}</span>
            </h2>
          </div>
          <div className="panel-heading-actions">
            <button
              className="button button-quiet card-header-refresh-btn"
              disabled={activityBusy}
              title="Refresh activity"
              aria-label="Refresh activity"
              onClick={(e) => {
                e.stopPropagation();
                refreshActivity(activityPagination.page);
              }}
            >
              <IconifyIcon
                icon="charm:refresh"
                width={16}
                height={16}
                className={activityBusy ? 'spin-icon' : ''}
              />
            </button>
          </div>
        </div>
        {auditCardOpen && (
          <>
            {activityBusy && !activity.length ? (
              <div className="soft-empty" role="status">Loading admin activity…</div>
            ) : activityError && !activity.length ? (
              <div className="soft-empty" role="alert">
                {activityError} <button className="button button-quiet" onClick={() => refreshActivity(activityPagination.page)}>Retry</button>
              </div>
            ) : activity.length ? (
              <div className="admin-activity-list">
                {activity.map((entry) => {
                  const hasDetails = entry.details && Object.keys(entry.details).length > 0;
                  return (
                    <article className="admin-activity-row" key={entry.id}>
                      <div>
                        <strong>
                          {entry.actorName} <small>{entry.actorRole}</small>
                        </strong>
                        <span>
                          {entry.action.replaceAll('_', ' ')} · {entry.targetLabel || 'account action'}
                        </span>
                        {hasDetails && (
                          <details className="admin-activity-details">
                            <summary className="admin-activity-summary">
                              <Icon name="arrow" size={10} />
                              <span>Modification details</span>
                            </summary>
                            <div className="admin-activity-code-box">
                              <pre>
                                <code>{JSON.stringify(entry.details, null, 2)}</code>
                              </pre>
                            </div>
                          </details>
                        )}
                      </div>
                      <time dateTime={new Date(entry.createdAt).toISOString()}>
                        {new Date(entry.createdAt).toLocaleString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Kolkata',
                        })}
                      </time>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="soft-empty">Admin actions will appear here as they happen.</div>
            )}
            {activityPagination.totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  className="button button-quiet"
                  disabled={activityBusy || activityPagination.page <= 1}
                  onClick={() => refreshActivity(activityPagination.page - 1)}
                >
                  {activityBusy ? (
                    <>
                      <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Previous
                    </>
                  ) : (
                    'Previous'
                  )}
                </button>
                <span>
                  Page {activityPagination.page} of {activityPagination.totalPages}
                </span>
                <button
                  className="button button-quiet"
                  disabled={activityBusy || activityPagination.page >= activityPagination.totalPages}
                  onClick={() => refreshActivity(activityPagination.page + 1)}
                >
                  {activityBusy ? (
                    <>
                      <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Next
                    </>
                  ) : (
                    'Next'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <section className="panel dashboard-rate-limits-panel water-glass-card">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              SECURITY & RATE LIMITS
            </div>
            <h2>
              Active rate limits {rateLimitCount !== null && <span className="count-badge">{rateLimitCount}</span>}
            </h2>
          </div>
          <div className="panel-heading-actions">
            <button
              type="button"
              className="button button-danger clear-rate-limits-btn"
              disabled={rateLimitBusy}
              onClick={clearAllRateLimits}
              title="Clear all active rate limits for all members and IPs in one click"
            >
              <IconifyIcon
                icon="charm:refresh"
                width={14}
                height={14}
                className={rateLimitBusy ? 'spin-icon' : ''}
              />
              <span>{rateLimitBusy ? 'Clearing…' : 'Clear all rate limits'}</span>
            </button>
          </div>
        </div>
      </section>
      <HeatmapDayModal
        heatmapDayModal={heatmapDayModal}
        closeHeatmapDayModal={closeHeatmapDayModal}
        heatmapSecondYearOnly={heatmapSecondYearOnly}
        navigateHeatmapDay={navigateHeatmapDay}
        isHeatmapPrevDisabled={isHeatmapPrevDisabled}
        isHeatmapNextDisabled={isHeatmapNextDisabled}
        heatmapDayBusy={heatmapDayBusy}
        heatmapDatePickerRef={heatmapDatePickerRef}
        MIN_HEATMAP_DATE={MIN_HEATMAP_DATE}
        todayDateKey={todayDateKey}
        openHeatmapDay={openHeatmapDay}
        heatmapDayData={heatmapDayData}
      />
      <footer className="site-footer">
        <span>DSAvation</span>
        <span>Technovation – The Networking Club</span>
      </footer>
    </main>
  );
}
