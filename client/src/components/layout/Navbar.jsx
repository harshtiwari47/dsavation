import React from 'react';
import { Icon as IconifyIcon } from '@iconify/react';
import { Icon } from '../common/Icon.jsx';
import { MemberAvatar } from '../common/MemberAvatar.jsx';

export const Navbar = React.memo(function Navbar({
  view,
  navigate,
  account,
  isAdmin,
  memberCounts,
  theme,
  setTheme,
  storedDarkStyle,
  rememberDarkStyle,
  storedLightStyle,
  rememberLightStyle,
  setAuthMode,
  setAuthOpen,
}) {
  const isCurrentLight = theme === 'light' || theme === 'technovation';

  return (
    <header className="topbar">
      <a
        className="brand"
        href="/"
        onClick={(event) => {
          event.preventDefault();
          navigate('general');
        }}
      >
        <picture>
          <source srcSet="/technovation-logo-tp.webp" type="image/webp" />
          <img className="brand-mark" src="/technovation-logo-tp.png" alt="Technovation Logo" />
        </picture>
        <span>DSAvation</span>
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        <button
          className={view === 'general' ? 'active' : ''}
          onClick={() => navigate('general')}
        >
          <IconifyIcon icon="bi:journal-bookmark" width={16} height={16} />
          Home
        </button>
        {account && (
          <button
            className={view === 'members' ? 'active' : ''}
            onClick={() => navigate('members')}
          >
            <Icon name="users" size={15} />
            Members
          </button>
        )}
        <button
          className={view === 'club' ? 'active' : ''}
          onClick={() => navigate('club')}
        >
          <Icon name="users" size={15} />
          Club challenge
        </button>
        {account && (
          <button
            className={view === 'activity' ? 'active' : ''}
            onClick={() => navigate('activity')}
          >
            <Icon name="calendar" size={15} />
            Activity
          </button>
        )}
        {isAdmin && (
          <button
            className={view === 'dashboard' ? 'active' : ''}
            onClick={() => navigate('dashboard')}
          >
            <IconifyIcon icon="hugeicons:dashboard-square-02" width={16} height={16} />
            Dashboard
            {memberCounts.pending > 0 && (
              <span className="nav-count">{memberCounts.pending}</span>
            )}
          </button>
        )}
      </nav>
      <div className="account-actions">
        <button
          className="theme-toggle"
          type="button"
          onClick={() =>
            setTheme((current) => {
              const isLight = current === 'light' || current === 'technovation';
              if (isLight) {
                if (rememberLightStyle) rememberLightStyle(current);
                return storedDarkStyle ? storedDarkStyle() : 'forest';
              }
              if (rememberDarkStyle) rememberDarkStyle(current);
              return storedLightStyle ? storedLightStyle() : 'light';
            })
          }
          aria-label={`Switch to ${isCurrentLight ? 'dark' : 'light'} mode`}
          title={`Switch to ${isCurrentLight ? 'dark' : 'light'} mode`}
        >
          <Icon name={isCurrentLight ? 'moon' : 'sun'} size={15} />
          <span>{isCurrentLight ? 'Dark' : 'Light'}</span>
        </button>
        {account ? (
          <button
            type="button"
            className={`account-profile-btn ${view === 'progress' ? 'active' : ''}`}
            onClick={() => navigate('progress')}
            title="Open Account & Settings"
            aria-label="Open Account & Settings"
          >
            <MemberAvatar person={account} label="" />
            <span className="account-name-label">
              <span className="account-name-row">
                <strong>{account.name.split(' ')[0]}</strong>
                {account.role === 'admin' && (
                  <span className="admin-verified-badge" title="Administrator">
                    <IconifyIcon icon="codicon:verified" width={18} height={18} />
                  </span>
                )}
              </span>
              {account.role !== 'member' && account.role !== 'admin' && (
                <small>{account.role}</small>
              )}
            </span>
          </button>
        ) : (
          <button
            className="button button-dark"
            onClick={() => {
              setAuthMode('login');
              setAuthOpen(true);
            }}
          >
            Sign in <Icon name="arrow" size={14} />
          </button>
        )}
      </div>
    </header>
  );
});
