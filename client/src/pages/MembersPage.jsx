import React from 'react';
import { Icon as IconifyIcon } from '@iconify/react';
import { Icon } from '../components/common/Icon.jsx';
import { MemberDirectoryCard } from '../components/members/MemberDirectoryCard.jsx';
import { MemberAdminOverlay } from '../components/members/MemberAdminOverlay.jsx';

export function MembersPage({
  account,
  isAdmin,
  directoryPagination,
  setAuthMode,
  setAuthOpen,
  directoryDebounceRef,
  loadDirectory,
  directoryQuery,
  setDirectoryQuery,
  directoryDepartment,
  setDirectoryDepartment,
  directoryDepartments,
  directoryYear,
  setDirectoryYear,
  directoryError,
  showAllLeetcodeStats,
  loadingAllStats,
  toggleAllLeetcodeStats,
  directoryBusy,
  directoryMembers,
  setDirectoryMembers,
  directoryLeetcodeStats,
  individuallyOpenedStats,
  setIndividuallyOpenedStats,
  leetcodeStatsBusy,
  loadDirectoryLeetcodeStats,
  adminOverlayMember,
  setAdminOverlayMember,
  memberBusy,
  updateRole,
  auraAwardBusy,
  handleAwardCustomAura,
  auraAwardAmount,
  setAuraAwardAmount,
  setMemberApproval,
  setMemberLeetcodeApproval,
  deleteMember,
}) {
  return (
    <main className="content-shell page-content members-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            TECHNOVATION COMMUNITY
          </div>
          <h1>
            Member directory<span>.</span>
          </h1>
        </div>
        <div className="metric-card member-count-card water-glass-card">
          <strong>{directoryPagination.total}</strong>
        </div>
      </div>
      {!account ? (
        <div className="login-prompt">
          <span className="prompt-icon">
            <Icon name="lock" size={23} />
          </span>
          <div>
            <h2>The member directory is for approved accounts.</h2>
            <p>Sign in with your approved account to browse club profiles.</p>
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
      ) : (
        <>
          <form
            className="panel directory-filters"
            onSubmit={(event) => {
              event.preventDefault();
              if (directoryDebounceRef.current) clearTimeout(directoryDebounceRef.current);
              loadDirectory(1, directoryQuery, directoryDepartment, directoryYear);
            }}
          >
            <label className="directory-search-field">
              <span>SEARCH</span>
              <div className="member-search">
                <Icon name="search" size={15} />
                <input
                  value={directoryQuery}
                  onChange={(event) => {
                    const val = event.target.value;
                    setDirectoryQuery(val);
                    if (directoryDebounceRef.current) clearTimeout(directoryDebounceRef.current);
                    directoryDebounceRef.current = setTimeout(() => {
                      loadDirectory(1, val, directoryDepartment, directoryYear);
                    }, 350);
                  }}
                  placeholder="Search name, Club Department, or username"
                  aria-label="Search members"
                />
              </div>
            </label>
            <label className="directory-select">
              <span>CLUB DEPARTMENT</span>
              <select
                value={directoryDepartment}
                onChange={(event) => {
                  if (directoryDebounceRef.current) clearTimeout(directoryDebounceRef.current);
                  setDirectoryDepartment(event.target.value);
                  loadDirectory(1, directoryQuery, event.target.value, directoryYear);
                }}
              >
                <option value="">All departments</option>
                {directoryDepartments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>
            <label className="directory-select">
              <span>YEAR</span>
              <select
                value={directoryYear}
                onChange={(event) => {
                  if (directoryDebounceRef.current) clearTimeout(directoryDebounceRef.current);
                  setDirectoryYear(event.target.value);
                  loadDirectory(1, directoryQuery, directoryDepartment, event.target.value);
                }}
              >
                <option value="">All years</option>
                <option value="first-year">First year</option>
                <option value="second-year">Second year</option>
                <option value="third-year">Third year</option>
                <option value="fourth-year">Fourth year</option>
                <option value="passed">Passed out</option>
              </select>
            </label>
            {isAdmin ? (
              <button
                className={`button ${showAllLeetcodeStats ? 'button-quiet view-all-stats-active' : 'button-dark'}`}
                type="button"
                disabled={loadingAllStats}
                onClick={toggleAllLeetcodeStats}
                title={showAllLeetcodeStats ? 'Hide LeetCode stats for all members' : 'View LeetCode stats for all members'}
              >
                {loadingAllStats ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Loading stats…
                  </span>
                ) : showAllLeetcodeStats ? (
                  'HIDE ALL STATS'
                ) : (
                  'VIEW ALL STATS'
                )}
              </button>
            ) : (
              <button className="button button-dark" type="submit" disabled={directoryBusy}>
                {directoryBusy ? 'Searching…' : 'Search'}
              </button>
            )}
            {(directoryQuery || directoryDepartment || directoryYear) && (
              <button
                className="button button-quiet"
                type="button"
                onClick={() => {
                  if (directoryDebounceRef.current) clearTimeout(directoryDebounceRef.current);
                  setDirectoryQuery('');
                  setDirectoryDepartment('');
                  setDirectoryYear('');
                  loadDirectory(1, '', '', '');
                }}
              >
                Clear filters
              </button>
            )}
          </form>
          {directoryBusy && !directoryMembers.length ? (
            <div className="panel directory-loading" role="status">
              <img src="/loading-expression.gif" alt="" aria-hidden="true" />
              <span>Loading approved member profiles…</span>
            </div>
          ) : directoryError && !directoryMembers.length ? (
            <div className="panel directory-empty" role="alert">
              <span>!</span>
              <h2>Member profiles couldn’t be loaded.</h2>
              <p>{directoryError}</p>
              <button className="button button-quiet" onClick={() => loadDirectory(1, directoryQuery, directoryDepartment, directoryYear)}>
                Retry
              </button>
            </div>
          ) : directoryMembers.length ? (
            <div className="member-directory-grid">
              {directoryMembers.map((member) => {
                const isSelf = member.id === account.id;
                const canSeeLeetcode = isAdmin || isSelf;
                const lookup = directoryLeetcodeStats[member.id];
                const stats = lookup?.stats;
                const maxActivity = Math.max(
                  1,
                  ...(stats?.byDifficulty || []).map((item) => item.attempted ?? item.solved)
                );
                const isSectionVisible =
                  canSeeLeetcode &&
                  member.leetcodeUsername &&
                  (showAllLeetcodeStats
                    ? true
                    : isSelf
                      ? Boolean(stats || lookup?.reason)
                      : Boolean(individuallyOpenedStats[member.id]));
                return (
                  <MemberDirectoryCard
                    key={member.id}
                    member={member}
                    isAdmin={isAdmin}
                    lookup={lookup}
                    stats={stats}
                    maxActivity={maxActivity}
                    isSectionVisible={isSectionVisible}
                    canSeeLeetcode={canSeeLeetcode}
                    leetcodeStatsBusy={leetcodeStatsBusy}
                    onAdminSelect={setAdminOverlayMember}
                    onOpenStats={(id) => setIndividuallyOpenedStats((prev) => ({ ...prev, [id]: true }))}
                    onLoadStats={loadDirectoryLeetcodeStats}
                  />
                );
              })}
            </div>
          ) : (
            <div className="panel directory-empty">
              <span>⌕</span>
              <h2>No members match these filters.</h2>
              <p>Try another year, department, or search term.</p>
            </div>
          )}
          {directoryPagination.totalPages > 1 && (
            <div className="pagination-controls">
              <button
                className="button button-quiet"
                disabled={directoryBusy || directoryPagination.page <= 1}
                onClick={() => loadDirectory(directoryPagination.page - 1)}
              >
                {directoryBusy ? (
                  <>
                    <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Previous
                  </>
                ) : (
                  'Previous'
                )}
              </button>
              <span>
                Page {directoryPagination.page} of {directoryPagination.totalPages} · {directoryPagination.total} members
              </span>
              <button
                className="button button-quiet"
                disabled={directoryBusy || directoryPagination.page >= directoryPagination.totalPages}
                onClick={() => loadDirectory(directoryPagination.page + 1)}
              >
                {directoryBusy ? (
                  <>
                    <IconifyIcon icon="charm:refresh" width={13} height={13} className="spin-icon" /> Next
                  </>
                ) : (
                  'Next'
                )}
              </button>
            </div>
          )}
          <MemberAdminOverlay
            adminOverlayMember={adminOverlayMember}
            setAdminOverlayMember={setAdminOverlayMember}
            account={account}
            memberBusy={memberBusy}
            updateRole={updateRole}
            setDirectoryMembers={setDirectoryMembers}
            auraAwardBusy={auraAwardBusy}
            handleAwardCustomAura={handleAwardCustomAura}
            auraAwardAmount={auraAwardAmount}
            setAuraAwardAmount={setAuraAwardAmount}
            setMemberApproval={setMemberApproval}
            setMemberLeetcodeApproval={setMemberLeetcodeApproval}
            deleteMember={deleteMember}
          />
        </>
      )}
      <footer className="site-footer">
        <span>DSAvation</span>
        <span>Technovation – The Networking Club</span>
      </footer>
    </main>
  );
}

