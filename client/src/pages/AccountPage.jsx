import React from 'react';
import { Icon as IconifyIcon } from '@iconify/react';
import { Icon } from '../components/common/Icon.jsx';
import { Pill } from '../components/common/Pill.jsx';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';
import { AVATAR_STYLES } from '../utils/avatar.js';
import { CLUB_DEPARTMENTS } from '../data/constants.js';

export function AccountPage({
  account,
  navigate,
  setAuthMode,
  setAuthOpen,
  saveProfile,
  profileName,
  setProfileName,
  profileDepartment,
  setProfileDepartment,
  profileStudyYear,
  setProfileStudyYear,
  profileLeetcodeUsername,
  setProfileLeetcodeUsername,
  profileGithubUsername,
  setProfileGithubUsername,
  profileCardBgUrl,
  setProfileCardBgUrl,
  profileBusy,
  disconnectGithub,
  accountSubmissionMethod,
  setAccountSubmissionMethod,
  isLeetcodeApproved,
  setNotice,
  requestLeetcodeApproval,
  avatarDraftStyle,
  avatarDraftSeed,
  setAvatarDraftSeed,
  avatarDraftCustomUrl,
  setAvatarDraftCustomUrl,
  shuffleAvatarChoices,
  chooseAvatarStyle,
  customUrlStatus,
  avatarChoices,
  darkStyle,
  setDarkStyle,
  rememberDarkStyle,
  lightStyle,
  setLightStyle,
  rememberLightStyle,
  theme,
  setTheme,
  isProfileDirty,
  handleInstallApp,
  isAppInstalled,
  logout,
}) {
  return (
    <main className="content-shell page-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            PERSONAL ACCOUNT
          </div>
          <h1>
            Account<span>.</span>
          </h1>
        </div>
        {account && (
          <button className="button button-quiet" type="button" onClick={() => navigate('activity')}>
            Question activity <Icon name="arrow" size={14} />
          </button>
        )}
      </div>
      {!account ? (
        <div className="login-prompt">
          <span className="prompt-icon">
            <Icon name="lock" size={23} />
          </span>
          <div>
            <h2>Your account and progress are private.</h2>
            <p>Sign in to update your member details and keep a dated record of solved questions.</p>
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
          <section className="panel account-settings">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-line" />
                  MEMBER DETAILS
                </div>
                <h2>Your profile</h2>
              </div>
            </div>
            <form
              className="account-form"
              key={`${account.id}:${account.githubUsername}:${account.githubVerified}:${account.defaultSubmissionMethod}:${account.leetcodeApproval}`}
              onSubmit={saveProfile}
            >
              <label>
                FULL NAME
                <input
                  name="name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  required
                  minLength="2"
                  maxLength="80"
                  autoComplete="name"
                />
              </label>
              <label>
                CLUB DEPARTMENT
                <select
                  name="department"
                  value={profileDepartment}
                  onChange={(e) => setProfileDepartment(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select your club department
                  </option>
                  {!CLUB_DEPARTMENTS.includes(profileDepartment) && profileDepartment && (
                    <option value={profileDepartment}>{profileDepartment}</option>
                  )}
                  {CLUB_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                YEAR OF STUDY
                <select
                  name="studyYear"
                  value={profileStudyYear}
                  onChange={(e) => setProfileStudyYear(e.target.value)}
                  required
                >
                  <option value="first-year">First year</option>
                  <option value="second-year">Second year</option>
                  <option value="third-year">Third year</option>
                  <option value="fourth-year">Fourth year</option>
                  <option value="passed">Passed out</option>
                </select>
              </label>
              <label>
                LEETCODE USERNAME
                <input
                  name="leetcodeUsername"
                  value={profileLeetcodeUsername}
                  onChange={(e) => setProfileLeetcodeUsername(e.target.value)}
                  required
                  pattern="[A-Za-z0-9_-]{1,40}"
                />
              </label>
              <div className="account-github-section">
                <div className="account-github-header">
                  <div className="account-github-title">
                    <Icon name="github" size={18} />
                    <strong>GITHUB USERNAME</strong>
                  </div>
                  {account.githubVerified ? (
                    <Pill tone="green">GitHub verified</Pill>
                  ) : (
                    <Pill tone="amber">GitHub not verified</Pill>
                  )}
                </div>
                <div className="account-github-body">
                  <label className="account-github-field">
                    <input
                      name="githubUsername"
                      value={profileGithubUsername}
                      onChange={(e) => setProfileGithubUsername(e.target.value)}
                      required={!account.githubVerified && Boolean(profileGithubUsername)}
                      pattern="[A-Za-z0-9-]{1,39}"
                      readOnly={account.githubVerified}
                      placeholder="Connect GitHub to fill this automatically"
                    />
                    <small>Read from your verified GitHub account.</small>
                  </label>
                  <div className="account-github-actions">
                    {account.githubVerified ? (
                      <button
                        className="button button-danger"
                        type="button"
                        disabled={profileBusy}
                        onClick={disconnectGithub}
                      >
                        Disconnect GitHub
                      </button>
                    ) : (
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() => {
                          window.location.href = '/api/auth/github/start';
                        }}
                      >
                        <Icon name="github" size={15} />
                        Connect GitHub
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="account-submission-pref">
                <span className="account-pref-label">DEFAULT SUBMISSION METHOD</span>
                <div className="account-radio-group" role="radiogroup" aria-label="Default submission method">
                  <label
                    className={`account-radio-card ${accountSubmissionMethod === 'github' ? 'selected' : ''}`}
                    onClick={() => setAccountSubmissionMethod('github')}
                  >
                    <input
                      type="radio"
                      name="defaultSubmissionMethod"
                      value="github"
                      checked={accountSubmissionMethod === 'github'}
                      onChange={() => setAccountSubmissionMethod('github')}
                      className="account-radio-input"
                    />
                    <div className="account-radio-indicator" aria-hidden="true">
                      <span className="account-radio-dot" />
                    </div>
                    <div className="account-radio-icon">
                      <Icon name="github" size={19} />
                    </div>
                    <div className="account-radio-text">
                      <strong>GitHub Commit</strong>
                      <span>Submit a commit code or full URL from your personal solutions repo</span>
                    </div>
                  </label>
                  <label
                    className={`account-radio-card ${accountSubmissionMethod === 'leetcode' ? 'selected' : ''} ${!isLeetcodeApproved ? (account.leetcodeApproval === 'pending' ? 'pending' : 'locked') : ''}`}
                    onClick={(e) => {
                      if (!isLeetcodeApproved) {
                        e.preventDefault();
                        if (account.leetcodeApproval === 'pending') {
                          setNotice('Your LeetCode submission access is pending administrator approval.');
                        } else {
                          setNotice('LeetCode submission requires administrator approval. Click "Request LeetCode Approval" below.');
                        }
                        return;
                      }
                      setAccountSubmissionMethod('leetcode');
                    }}
                  >
                    <input
                      type="radio"
                      name="defaultSubmissionMethod"
                      value="leetcode"
                      disabled={!isLeetcodeApproved}
                      checked={accountSubmissionMethod === 'leetcode'}
                      onChange={() => {
                        if (isLeetcodeApproved) setAccountSubmissionMethod('leetcode');
                      }}
                      className="account-radio-input"
                    />
                    <div className="account-radio-indicator" aria-hidden="true">
                      <span className="account-radio-dot" />
                    </div>
                    <div className="account-radio-icon">
                      <IconifyIcon icon="bxl:leetcode" width={20} height={20} />
                    </div>
                    <div className="account-radio-text">
                      <div className="account-radio-title-row">
                        <strong>LeetCode Direct</strong>
                        {isLeetcodeApproved ? (
                          <span className="lc-status-pill approved">
                            <Icon name="check" size={10} /> Approved
                          </span>
                        ) : account.leetcodeApproval === 'pending' ? (
                          <span className="lc-status-pill pending">Pending Approval</span>
                        ) : (
                          <span className="lc-status-pill locked">Requires Approval</span>
                        )}
                      </div>
                      <span>
                        {isLeetcodeApproved
                          ? 'Automatically verify your accepted LeetCode submissions for today'
                          : account.leetcodeApproval === 'pending'
                          ? 'Your request to use LeetCode submission is waiting for admin approval'
                          : 'Submit directly via LeetCode once approved by an administrator'}
                      </span>
                      {!isLeetcodeApproved && account.leetcodeApproval !== 'pending' && (
                        <div className="lc-request-action">
                          <button
                            type="button"
                            className="button button-quiet request-lc-btn"
                            disabled={profileBusy}
                            onClick={requestLeetcodeApproval}
                          >
                            {profileBusy ? 'Requesting…' : 'Request LeetCode Approval'}
                          </button>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
                {!isLeetcodeApproved && (
                  <small className="account-pref-hint">
                    Direct LeetCode submissions require administrator approval. You can submit solutions via GitHub commit anytime.
                  </small>
                )}
              </div>
              <div className="avatar-picker">
                <div className="avatar-picker-heading">
                  <MemberAvatar
                    style={avatarDraftStyle}
                    seed={avatarDraftStyle === 'custom' ? avatarDraftCustomUrl : (avatarDraftSeed || account.avatarSeed || account.id)}
                    url={avatarDraftStyle === 'custom' ? avatarDraftCustomUrl : undefined}
                    className="avatar-current"
                    label="Selected avatar preview"
                  />
                  <div>
                    <strong>Choose your avatar</strong>
                    {avatarDraftStyle !== 'custom' && (
                      <span>Pick a style, then select a face or shuffle the options.</span>
                    )}
                  </div>
                  {avatarDraftStyle !== 'custom' && (
                    <button type="button" className="button button-quiet" onClick={shuffleAvatarChoices}>
                      Shuffle options
                    </button>
                  )}
                </div>
                <div className="avatar-style-tabs" role="tablist" aria-label="Avatar styles">
                  {AVATAR_STYLES.map((style) => (
                    <button
                      type="button"
                      key={style.id}
                      role="tab"
                      aria-selected={avatarDraftStyle === style.id}
                      className={avatarDraftStyle === style.id ? 'selected' : ''}
                      onClick={() => chooseAvatarStyle(style.id)}
                    >
                      {style.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={avatarDraftStyle === 'custom'}
                    className={avatarDraftStyle === 'custom' ? 'selected' : ''}
                    onClick={() => chooseAvatarStyle('custom')}
                  >
                    Custom URL
                  </button>
                </div>
                {avatarDraftStyle === 'custom' ? (
                  <div className="custom-avatar-box">
                    <label className="custom-avatar-label">
                      <span>CUSTOM IMAGE URL</span>
                      <div className="custom-avatar-input-wrapper">
                        <input
                          type="url"
                          className="custom-avatar-input"
                          placeholder="https://example.com/avatar.png"
                          value={avatarDraftCustomUrl}
                          onChange={(e) => {
                            setAvatarDraftCustomUrl(e.target.value);
                            setAvatarDraftSeed(e.target.value.trim() || 'custom-avatar');
                          }}
                        />
                        {avatarDraftCustomUrl && (
                          <button
                            type="button"
                            className="button button-quiet"
                            onClick={() => {
                              setAvatarDraftCustomUrl('');
                              setAvatarDraftSeed('custom-avatar');
                            }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </label>
                    <div className={`custom-url-status ${customUrlStatus.type}`}>
                      {customUrlStatus.valid ? (
                        <IconifyIcon icon="keyline-icons:image-check-fill" width={16} height={16} />
                      ) : (
                        <Icon name="lock" size={14} />
                      )}
                      <span>{customUrlStatus.message}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="avatar-choice-grid" aria-label="Choose an avatar">
                      {avatarChoices.map((seed, index) => (
                        <button
                          type="button"
                          key={seed}
                          className={`avatar-choice ${avatarDraftSeed === seed ? 'selected' : ''}`}
                          aria-label={`Choose avatar ${index + 1}`}
                          aria-pressed={avatarDraftSeed === seed}
                          onClick={() => setAvatarDraftSeed(seed)}
                        >
                          <MemberAvatar style={avatarDraftStyle} seed={seed} label="" />
                        </button>
                      ))}
                    </div>
                    <small className="avatar-license-note">
                      CC BY 4.0 credits:{' '}
                      <a href="https://www.dicebear.com/styles/fun-emoji/" target="_blank" rel="noreferrer">
                        Fun Emoji Set by Davis Uche
                      </a>{' '}
                      and{' '}
                      <a href="https://www.dicebear.com/styles/micah/" target="_blank" rel="noreferrer">
                        Avatar Illustration System by Micah Lanier
                      </a>
                      .
                    </small>
                  </>
                )}
              </div>
              <div className="custom-card-bg-box">
                <div className="custom-card-bg-header">
                  <div>
                    <strong>Custom background image</strong>
                  </div>
                </div>
                <label className="custom-avatar-label">
                  <span>CUSTOM CARD BACKGROUND URL</span>
                  <div className="custom-avatar-input-wrapper">
                    <input
                      type="url"
                      name="cardBgUrl"
                      className="custom-avatar-input"
                      placeholder="https://example.com/background.jpg"
                      value={profileCardBgUrl}
                      onChange={(e) => setProfileCardBgUrl(e.target.value)}
                    />
                    {profileCardBgUrl && (
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={() => setProfileCardBgUrl('')}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </label>
              </div>
              <div className="theme-choice">
                <span className="account-pref-label">COLOR THEME &amp; APPEARANCE</span>
                <div className="theme-choice-grid theme-choice-grid-4" role="radiogroup" aria-label="Color theme and appearance">
                  <div className="theme-choice-group-label">
                    <strong>Light themes</strong>
                  </div>
                  <button
                    type="button"
                    className={`theme-choice-card ${theme === 'light' ? 'selected' : ''} ${lightStyle === 'light' ? 'mode-selected' : ''}`}
                    aria-pressed={theme === 'light'}
                    onClick={() => {
                      rememberLightStyle?.('light');
                      setLightStyle?.('light');
                      setTheme('light');
                    }}
                  >
                    <i className="theme-swatch classic-light" />
                    <span className="theme-choice-copy">
                      <strong>Classic Light</strong>
                      <span>Sky &amp; slate</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`theme-choice-card ${theme === 'technovation' ? 'selected' : ''} ${lightStyle === 'technovation' ? 'mode-selected' : ''}`}
                    aria-pressed={theme === 'technovation'}
                    onClick={() => {
                      rememberLightStyle?.('technovation');
                      setLightStyle?.('technovation');
                      setTheme('technovation');
                    }}
                  >
                    <i className="theme-swatch technovation" />
                    <span className="theme-choice-copy">
                      <strong>Technovation</strong>
                      <span>Orange &amp; blue light</span>
                    </span>
                  </button>
                  <div className="theme-choice-group-label">
                    <strong>Dark themes</strong>
                  </div>
                  <button
                    type="button"
                    className={`theme-choice-card ${theme === 'forest' ? 'selected' : ''} ${darkStyle === 'forest' ? 'mode-selected' : ''}`}
                    aria-pressed={theme === 'forest'}
                    onClick={() => {
                      rememberDarkStyle('forest');
                      setDarkStyle('forest');
                      setTheme('forest');
                    }}
                  >
                    <i className="theme-swatch forest" />
                    <span className="theme-choice-copy">
                      <strong>Forest</strong>
                      <span>Soft teal night</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`theme-choice-card ${theme === 'dark' ? 'selected' : ''} ${darkStyle === 'dark' ? 'mode-selected' : ''}`}
                    aria-pressed={theme === 'dark'}
                    onClick={() => {
                      rememberDarkStyle('dark');
                      setDarkStyle('dark');
                      setTheme('dark');
                    }}
                  >
                    <i className="theme-swatch slate" />
                    <span className="theme-choice-copy">
                      <strong>Slate</strong>
                      <span>Cool navy night</span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="account-form-actions">
                <button className="button button-dark" disabled={profileBusy || !isProfileDirty}>
                  {profileBusy ? 'Saving…' : 'Save account details'} <Icon name="arrow" size={14} />
                </button>
                <button
                  type="button"
                  className="button button-quiet install-app-btn"
                  onClick={handleInstallApp}
                  title={isAppInstalled ? 'Application installed' : 'Install DSAvation as a Desktop / Mobile app'}
                >
                  <IconifyIcon
                    icon={isAppInstalled ? 'charm:circle-tick' : 'fluent:arrow-download-24-filled'}
                    width={16}
                    height={16}
                  />
                  <span>{isAppInstalled ? 'App Installed' : 'Install App'}</span>
                </button>
                <button className="button button-danger" type="button" onClick={logout}>
                  <Icon name="logout" size={14} />
                  Sign out
                </button>
              </div>
            </form>
          </section>
        </>
      )}
      <footer className="site-footer">
        <span>DSAvation</span>
        <span>Technovation – The Networking Club</span>
      </footer>
    </main>
  );
}

