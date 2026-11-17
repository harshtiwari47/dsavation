import React from 'react';
import { Icon } from '../common/Icon.jsx';
import { MemberAvatar } from '../common/MemberAvatar.jsx';
import { localDay, studyYearLabel } from '../../utils/dateUtils.js';

export function ExplainerModal({
  explainerModalOpen,
  selectedExplainer,
  setExplainerModalOpen,
  club,
  assignedQuestion,
  handleCopyExplainerImage,
  imageExporting,
  copiedNotice,
  todaySubmissionsData,
}) {
  if (!explainerModalOpen || !selectedExplainer) return null;

  const explainerId = String(selectedExplainer.id || selectedExplainer.userId || '');

  // Cross-check if the explainer has submitted today's assignment
  const submissionFromToday = todaySubmissionsData?.submissions?.find(
    (s) => String(s.member?.id || s.userId || s.memberId || '') === explainerId && s.status === 'accepted'
  );

  const submissionFromLeaderboard = club?.todayLeaderboard?.find(
    (m) => String(m.id || m.userId || '') === explainerId
  );

  const rawSubmittedAt =
    selectedExplainer.submittedAt ||
    submissionFromToday?.submittedAt ||
    submissionFromLeaderboard?.submittedAt ||
    null;

  const isValidDate = rawSubmittedAt && !isNaN(new Date(rawSubmittedAt).getTime());

  const hasSubmitted = Boolean(
    (selectedExplainer.hasSubmitted && isValidDate) ||
    (selectedExplainer.status === 'accepted' && isValidDate) ||
    submissionFromToday ||
    submissionFromLeaderboard
  );

  const formattedTime = hasSubmitted && isValidDate
    ? new Date(rawSubmittedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : '';

  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setExplainerModalOpen(false);
      }}
    >
      <section className="auth-modal explainer-modal" role="dialog" aria-modal="true" aria-labelledby="explainer-modal-title">
        <button className="modal-close" onClick={() => setExplainerModalOpen(false)} aria-label="Close">
          ×
        </button>
        <div className="eyebrow">
          <span className="eyebrow-line" />
          TODAY'S SOLUTION SPOTLIGHT
        </div>
        <h2 id="explainer-modal-title">Solution Explainer Selected 🎉</h2>
        <p className="auth-lede">
          Randomly selected among members who attempted today's question. Download or copy their share card image to share on WhatsApp or the club group so they can explain their solution!
        </p>

        <div className="explainer-preview-card" id="explainer-spotlight-card">
          <div className="explainer-preview-header">
            <div className="explainer-brand-lockup">
              <picture>
                <source srcSet="/technovation-logo-tp.webp" type="image/webp" />
                <img src="/technovation-logo-tp.png" alt="Logo" className="explainer-card-logo" />
              </picture>
              <div>
                <span className="explainer-preview-brand">TECHNOVATION CLUB</span>
                <span className="explainer-sub-brand">DSAvation · Daily Problem Spotlight</span>
              </div>
            </div>
            <div className="explainer-date-pill">
              📅 {club?.assignment?.dateKey || localDay()}
            </div>
          </div>

          <div className="explainer-preview-question">
            <div className="explainer-q-eyebrow">QUESTION OF THE DAY</div>
            <div className="explainer-q-main">
              <strong>
                LC #{assignedQuestion?.id || selectedExplainer.questionId} · {assignedQuestion?.title || selectedExplainer.questionTitle}
              </strong>
              {assignedQuestion?.difficulty && (
                <span className={`explainer-diff-pill diff-${assignedQuestion.difficulty.toLowerCase()}`}>
                  {assignedQuestion.difficulty.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          <div className="explainer-preview-body">
            <div className="explainer-avatar-wrap">
              <MemberAvatar person={selectedExplainer} className="explainer-preview-avatar" label="" />
            </div>
            <div className="explainer-preview-info">
              <span className="explainer-spotlight-tag">🎉 SELECTED SOLUTION EXPLAINER</span>
              <h3>{selectedExplainer.name}</h3>
              <div className="explainer-preview-dept">
                {selectedExplainer.department || 'Club Member'} {selectedExplainer.studyYear && `· ${studyYearLabel(selectedExplainer.studyYear)}`}
              </div>
              <div className="explainer-preview-handles">
                {selectedExplainer.githubUsername && (
                  <span className="gh-tag">
                    <Icon name="github" size={13} /> @{selectedExplainer.githubUsername}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="explainer-preview-footer">
            {hasSubmitted && formattedTime && (
              <div className="explainer-footer-status">
                ✓ Solution Attempt Accepted · Submitted {formattedTime} IST
              </div>
            )}
            <div className="explainer-footer-prompt">
              Please share your code walkthrough, approach and complexity insights in today's club session!
            </div>
          </div>
        </div>

        <div className="explainer-modal-actions">
          <button
            type="button"
            className="button button-dark"
            onClick={handleCopyExplainerImage}
            disabled={imageExporting}
          >
            <Icon name="copy" size={14} /> {copiedNotice ? '✓ Copied to Clipboard!' : 'Copy Card Image'}
          </button>
        </div>
      </section>
    </div>
  );
}
