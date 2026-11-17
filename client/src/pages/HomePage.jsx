import React from 'react';
import { Icon } from '../components/common/Icon.jsx';
import { Pill } from '../components/common/Pill.jsx';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';
import { HeroTitleTypewriter } from '../components/home/HeroTitleTypewriter.jsx';
import { QuestionActionsGuide } from '../components/home/QuestionActionsGuide.jsx';
import { QuestionRow } from '../components/home/QuestionRow.jsx';

export function HomePage({
  account,
  assignedQuestion,
  club,
  navigate,
  solvedCount,
  setAuthMode,
  setAuthOpen,
  visibleQuestions,
  query,
  setQuery,
  topic,
  setTopic,
  topics,
  difficulty,
  setDifficulty,
  structure,
  setStructure,
  structures,
  pattern,
  setPattern,
  patterns,
  sort,
  setSort,
  paginatedQuestions,
  progress,
  clubLocked,
  handleSolve,
  clearFilters,
  totalQuestionPages,
  safeQuestionPage,
  setQuestionPage,
}) {
  return (
    <main className="content-shell home-page">
      <section className="welcome-row home-welcome-row">
        <div className="welcome-hero-lead">
          <div className="hero-mascot-wrapper">
            <img src="/technovation-mascot.webp" alt="Technovation Club Mascot" className="hero-mascot-img" />
          </div>
          <div className="hero-content">
            <div className="eyebrow">
              <span className="eyebrow-line" />
              TECHNOVATION DSA SERIES
            </div>
            <HeroTitleTypewriter />
            <p className="hero-subtitle">
              A shared question library for focused practice, personal progress, and the club’s daily challenge.
            </p>
          </div>
        </div>
        <div className="hero-index">
          <span>THE CURRICULUM</span>
          <strong>220</strong>
          <small>DSA QUESTIONS</small>
        </div>
      </section>

      <section className="overview-grid" aria-label="Club and personal overview">
        <article className="overview-card today-card">
          <div className="card-fluid-mesh" aria-hidden="true">
            <span className="fluid-blob fluid-blob-1" />
            <span className="fluid-blob fluid-blob-2" />
            <span className="fluid-blob fluid-blob-3" />
            <span className="fluid-shimmer-sweep" />
          </div>
          <div className="today-card-content">
            <div className="card-kicker">
              <span className="live-dot" />
              <span>QUESTION OF THE DAY</span>
            </div>
            {!account ? (
              <div className="empty-assignment">
                <h2>Sign in to view today’s question</h2>
                <p>Approved members can see the daily question and track their practice.</p>
              </div>
            ) : assignedQuestion ? (
              <>
                <div className="today-date">
                  <span>
                    {club?.assignment?.dateKey ? club.assignment.dateKey.split('-').reverse().join('-') : ''}
                  </span>
                  <span className="date-sep">·</span>
                  <span className="topic-name">{assignedQuestion.topic}</span>
                </div>
                <h2>{assignedQuestion.title}</h2>
                <div className="today-details">
                  <Pill tone={assignedQuestion.difficulty.toLowerCase()}>{assignedQuestion.difficulty}</Pill>
                  <span className="meta-badge">LeetCode #{assignedQuestion.id}</span>
                  <span className="meta-badge">Day {assignedQuestion.day} / 220</span>
                </div>
                <div className="club-participation">
                  <button className="challenge-link-btn" onClick={() => navigate('club')}>
                    View challenge <Icon name="arrow" size={13} />
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-assignment">
                <h2>No question assigned today</h2>
                <p>
                  Club leads can publish the next Question of the Day. Holidays and break days do not count as missed practice.
                </p>
              </div>
            )}
          </div>
        </article>
        <article className="overview-card personal-card">
          <div className="card-kicker">YOUR PRIVATE TRACKER</div>
          <div className="personal-stat">
            <strong>{account ? solvedCount : '—'}</strong>
            <span>
              <b>{account ? `${Math.round((solvedCount / 220) * 100)}%` : 'Personal'}</b>
              <br />
              {account ? 'of the 220 questions tracked' : 'progress stays private'}
            </span>
          </div>
          <div className="personal-track">
            <i style={{ width: `${account ? Math.min(100, (solvedCount / 220) * 100) : 0}%` }} />
          </div>
          <p>
            {account
              ? 'Your manual checkmarks are visible only to you. They never add club points.'
              : 'Sign in to save which questions you have solved.'}
          </p>
          <button
            className="text-button"
            onClick={() => {
              if (!account) {
                setAuthMode('login');
                setAuthOpen(true);
                return;
              }
              navigate('activity');
            }}
          >
            {account ? 'View activity' : 'Sign in to track'} <Icon name="arrow" size={14} />
          </button>
        </article>
        <article className="overview-card community-card">
          <div className="card-kicker">
            <Icon name="users" size={14} /> CLUB PARTICIPATION
          </div>
          <div className="community-figure">
            <strong>{club?.acceptedCount || 0}</strong>
            <span>members accepted today</span>
          </div>
          {club?.participants?.length ? (
            <div className="participant-list">
              {club.participants.slice(0, 3).map((person, idx, arr) => (
                <span className="participant" key={`${person.githubUsername}-${person.name}`}>
                  <MemberAvatar person={person} label="" />
                  <span className="participant-name">{person.name.split(' ')[0]}</span>
                  {idx === arr.length - 1 && club.participants.length > 3 && (
                    <span className="participant-more">+{club.participants.length - 3}</span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="privacy-note">
              Approved members with accepted club submissions appear here; personal checkmarks stay private.
            </p>
          )}
          <button className="text-button" onClick={() => navigate('club')}>
            See the scoreboard <Icon name="arrow" size={14} />
          </button>
        </article>
      </section>

      {!account && (
        <section className="library-locked panel">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              THE QUESTION LIBRARY
            </div>
            <h2>
              Sign in to access the curriculum<span>.</span>
            </h2>
            <p>Question titles, patterns, and solution notes are available to approved members.</p>
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
        </section>
      )}

      {account && (
        <section className="library-section" id="library">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                THE QUESTION LIBRARY
              </div>
              <h2>
                Find your next rep<span>.</span>
              </h2>
            </div>
            <span className="question-total">
              {visibleQuestions.length} <i>/</i> 220 QUESTIONS
            </span>
          </div>
          <div className="filter-bar">
            <label className="search-input">
              <Icon name="search" size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search a title, pattern, algorithm or LC number"
              />
              <kbd>/</kbd>
            </label>
            <label className="filter-select">
              <span>TOPIC</span>
              <select value={topic} onChange={(event) => setTopic(event.target.value)}>
                <option>All topics</option>
                {topics.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span>LEVEL</span>
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                <option>Any level</option>
                {['Easy', 'Medium', 'Hard'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span>DATA STRUCTURE</span>
              <select value={structure} onChange={(event) => setStructure(event.target.value)}>
                <option>Any data structure</option>
                {structures.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span>PATTERN</span>
              <select value={pattern} onChange={(event) => setPattern(event.target.value)}>
                <option>Any pattern</option>
                {patterns.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <button
              className="sort-button"
              onClick={() => setSort((current) => (current === 'day' ? 'title' : 'day'))}
            >
              Sort: {sort === 'day' ? 'Day' : 'Title'} ↕
            </button>
          </div>
          <QuestionActionsGuide />
          <div className="question-list">
            {visibleQuestions.length ? (
              paginatedQuestions.map((question) => (
                <QuestionRow
                  key={question.id}
                  question={question}
                  solved={Boolean(progress[question.id] || clubLocked[question.id])}
                  solvedAt={progress[question.id]}
                  locked={Boolean(clubLocked[question.id])}
                  onSolve={handleSolve}
                />
              ))
            ) : (
              <div className="no-results">
                <span>⌕</span>
                <strong>No questions match those filters.</strong>
                <p>Try a different topic, level, or keyword.</p>
                <button onClick={clearFilters}>Reset filters</button>
              </div>
            )}
          </div>
          {visibleQuestions.length > 0 && totalQuestionPages > 1 && (
            <div className="pagination-controls" aria-label="Question library pages">
              <button
                type="button"
                className="button button-quiet"
                disabled={safeQuestionPage <= 1}
                onClick={() => {
                  setQuestionPage((p) => Math.max(1, p - 1));
                  document.getElementById('library')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Previous
              </button>
              <span>
                Page {safeQuestionPage} of {totalQuestionPages} · {visibleQuestions.length} questions
              </span>
              <button
                type="button"
                className="button button-quiet"
                disabled={safeQuestionPage >= totalQuestionPages}
                onClick={() => {
                  setQuestionPage((p) => Math.min(totalQuestionPages, p + 1));
                  document.getElementById('library')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
      <footer className="site-footer">
        <span>DSAvation</span>
        <span>Technovation – The Networking Club</span>
      </footer>
    </main>
  );
}

