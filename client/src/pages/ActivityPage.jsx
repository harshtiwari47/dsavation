import React from 'react';
import { Icon } from '../components/common/Icon.jsx';
import { ProgressHeatmap } from '../components/common/ProgressHeatmap.jsx';
import { QuestionRow } from '../components/home/QuestionRow.jsx';

export function ActivityPage({
  account,
  setAuthMode,
  setAuthOpen,
  clubActivity,
  clubTrackedCount,
  clubActivityBusy,
  clubActivityLoaded,
  clubActivityError,
  retryClubActivity,
  navigate,
  byId,
  handleSolve,
}) {
  return (
    <main className="content-shell page-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            CLUB CHALLENGE RECORD
          </div>
          <h1>
            Question activity<span>.</span>
          </h1>
        </div>
      </div>
      {!account ? (
        <div className="login-prompt">
          <span className="prompt-icon">
            <Icon name="lock" size={23} />
          </span>
          <div>
            <h2>Question activity is private to your account.</h2>
            <p>Sign in to see the Club Challenge questions you have submitted.</p>
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
      ) : !clubActivityLoaded || clubActivityBusy ? (
        <div className="soft-empty" role="status">Loading your Club Challenge activity…</div>
      ) : clubActivityError ? (
        <div className="soft-empty" role="alert">
          <span>Could not load your Club Challenge activity: {clubActivityError}</span>
          <button className="button button-quiet" onClick={retryClubActivity}>Retry</button>
        </div>
      ) : (
        <>
          <ProgressHeatmap progress={clubActivity} />
          <div className="section-heading compact">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                YOUR COMPLETIONS
              </div>
              <h2>{clubTrackedCount ? 'Recently tracked' : 'A clean slate'}</h2>
            </div>
            <button
              className="button button-quiet"
              onClick={() => {
                navigate('club');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Open club challenge <Icon name="arrow" size={14} />
            </button>
          </div>
          {clubTrackedCount ? (
            <div className="question-list">
              {Object.entries(clubActivity)
                .sort((a, b) => new Date(b[1]) - new Date(a[1]))
                .map(([id, solvedAt]) => byId.get(Number(id)) && { question: byId.get(Number(id)), solvedAt })
                .filter(Boolean)
                .map(({ question, solvedAt }) => (
                  <QuestionRow
                    key={question.id}
                    question={question}
                    solved={true}
                    solvedAt={solvedAt}
                    locked
                    onSolve={handleSolve}
                  />
                ))}
            </div>
          ) : (
            <div className="empty-panel">
              <span>01</span>
              <h2>Your first Club Challenge starts the record.</h2>
              <p>
                Submit a verified solution in Club Challenge. Personal checkmarks stay in the question library and do not appear here.
              </p>
              <button className="button button-dark" onClick={() => navigate('club')}>
                Open club challenge <Icon name="arrow" size={14} />
              </button>
            </div>
          )}
        </>
      )}
      <footer className="site-footer">
        <span>DSAvation</span>
        <span>Technovation – The Networking Club</span>
      </footer>
    </main>
  );
}

