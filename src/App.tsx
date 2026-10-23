import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { languages, translate } from './i18n';
import './App.css';

type User = { id: number; email: string; fullName: string };
type Gym = {
  id: number; name: string; role?: string; timezone?: string; currency?: string;
  slug?: string; status?: string; owner_email?: string | null;
  subscription_status?: string | null; subscription_ends_at?: string | null;
  plan_name?: string | null;
};
type PlatformStats = {
  total_gyms: number | string;
  active_gyms: number | string;
  suspended_gyms: number | string;
  total_plans: number | string;
  active_subscriptions: number | string;
  attention_subscriptions: number | string;
};
type PlatformPlan = {
  id: number; name: string; description: string; price_minor: number | string;
  currency: string; duration_days: number; is_active: boolean;
};
type PlatformAudit = {
  id: number; actor_user_id: number | null; action: string;
  target_type: string; target_id: number | null; details: unknown; created_at: string;
};
type Stats = {
  total_members: number | string;
  active_memberships: number | string;
  today_attendance: number | string;
  monthly_revenue_minor: number | string;
};
type Member = {
  id: number;
  member_no: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
};
type ApiResult = {
  success?: boolean;
  error?: string;
  user?: User;
  gyms?: Gym[];
  selectedGymId?: number | null;
  gym?: Gym;
  stats?: Stats;
  members?: Member[];
  member?: Member;
  dashboard?: PlatformStats;
  plans?: PlatformPlan[];
  events?: PlatformAudit[];
};

const menu = [
  { label: 'Overview', icon: '⌂' },
  { label: 'Members', icon: '♙' },
  { label: 'Memberships', icon: '◈' },
  { label: 'Classes & Booking', icon: '▦' },
  { label: 'Coaches', icon: '♧' },
  { label: 'Attendance', icon: '◷' },
  { label: 'Finance & POS', icon: '$' },
  { label: 'Reports', icon: '▤' },
  { label: 'Settings', icon: '⚙' },
];

async function api(path: string, options: RequestInit = {}): Promise<ApiResult> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({})) as ApiResult;
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function App() {
  const [language, setLanguage] = useState(() => {
    try { const saved = localStorage.getItem('fitos-language'); return languages.some(item => item.code === saved) ? saved! : 'en'; } catch { return 'en'; }
  });
  const t = (key: string) => translate(language, key);
  const direction = languages.find(item => item.code === language)?.dir || 'ltr';
  useEffect(() => {
    try { localStorage.setItem('fitos-language', language); } catch { /* storage may be unavailable */ }
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [language, direction]);
  const [user, setUser] = useState<User | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [active, setActive] = useState('Overview');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [platformGyms, setPlatformGyms] = useState<Gym[]>([]);
  const [platformPlans, setPlatformPlans] = useState<PlatformPlan[]>([]);
  const [platformAudit, setPlatformAudit] = useState<PlatformAudit[]>([]);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState(false);

  const refreshPlatform = useCallback(async () => {
    const dashboard = await api('/api/platform/dashboard');
    const [gymData, planData, auditData] = await Promise.all([
      api('/api/platform/gyms'),
      api('/api/platform/plans'),
      api('/api/platform/audit-log?limit=50'),
    ]);
    setPlatformStats(dashboard.dashboard || null);
    setPlatformGyms((gymData.gyms || []) as Gym[]);
    setPlatformPlans(planData.plans || []);
    setPlatformAudit(auditData.events || []);
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.resolve()
      .then(() => refreshPlatform())
      .then(() => { if (alive) setIsPlatformOwner(true); })
      .catch(() => { if (alive) setIsPlatformOwner(false); });
    return () => { alive = false; };
  }, [user, refreshPlatform]);

  const changeGymStatus = async (gymId: number, status: 'active' | 'suspended') => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/platform/gyms/${gymId}/status`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      setNotice(`Gym status updated to ${status}.`);
      await refreshPlatform();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update gym status.');
    } finally { setBusy(false); }
  };

  const createPlatformPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/platform/plans', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') || '').trim(),
          description: String(form.get('description') || '').trim(),
          priceMinor: Math.round(Number(form.get('price') || 0) * 100),
          currency: String(form.get('currency') || 'USD').toUpperCase(),
          durationDays: Number(form.get('durationDays') || 30),
          isActive: true,
        }),
      });
      setShowPlanForm(false);
      setNotice('Subscription plan created.');
      await refreshPlatform();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create plan.');
    } finally { setBusy(false); }
  };

  const assignPlan = async (gymId: number, planId: number) => {
    if (!planId) { setError('Choose a subscription plan first.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/platform/gyms/${gymId}/subscription`, {
        method: 'POST',
        body: JSON.stringify({ planId, status: 'active' }),
      });
      setNotice('Subscription assigned successfully.');
      await refreshPlatform();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign subscription.');
    } finally { setBusy(false); }
  };

  const loadWorkspace = useCallback(async (currentUser?: User) => {
    const me = await api('/api/auth/me');
    const signedInUser = currentUser || me.user;
    if (!signedInUser) throw new Error('Please sign in again.');
    setUser(signedInUser);

    const gyms = me.gyms || [];
    if (!gyms.length) throw new Error('No active gym is linked to this account.');

    let selectedId = me.selectedGymId;
    if (!selectedId) {
      const selected = await api('/api/auth/select-gym', {
        method: 'POST',
        body: JSON.stringify({ gymId: gyms[0].id }),
      });
      selectedId = selected.gym?.id || gyms[0].id;
    }

    const [dashboard, memberData] = await Promise.all([
      api('/api/gym/dashboard'),
      api('/api/gym/members'),
    ]);

    setGym(dashboard.gym || gyms.find(item => item.id === selectedId) || null);
    setStats(dashboard.stats || null);
    setMembers(memberData.members || []);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadWorkspace();
      } catch {
        if (alive) {
          setUser(null);
          setGym(null);
          setStats(null);
          setMembers([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [loadWorkspace]);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {
      email: String(form.get('email') || '').trim(),
      password: String(form.get('password') || ''),
    };

    if (authMode === 'register') {
      payload.fullName = String(form.get('fullName') || '').trim();
      payload.gymName = String(form.get('gymName') || '').trim();
      payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      payload.currency = 'USD';
    }

    try {
      const result = await api(
        authMode === 'register' ? '/api/auth/register' : '/api/auth/login',
        { method: 'POST', body: JSON.stringify(payload) },
      );

      if (result.gyms?.length && !result.selectedGymId) {
        await api('/api/auth/select-gym', {
          method: 'POST',
          body: JSON.stringify({ gymId: result.gyms[0].id }),
        });
      }

      await loadWorkspace(result.user);
      setNotice('Signed in successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
      setUser(null);
      setIsPlatformOwner(false);
      setGym(null);
      setStats(null);
      setMembers([]);
      setActive('Overview');
      setNotice('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/gym/members', {
        method: 'POST',
        body: JSON.stringify({
          firstName: String(form.get('firstName') || '').trim(),
          lastName: String(form.get('lastName') || '').trim(),
          email: String(form.get('email') || '').trim(),
          phone: String(form.get('phone') || '').trim(),
        }),
      });
      setShowMemberForm(false);
      setNotice('Member added.');
      await loadWorkspace(user || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member.');
    } finally {
      setBusy(false);
    }
  };

  const number = (value: number | string | undefined) =>
    Number(value || 0).toLocaleString();

  const money = (minor: number | string | undefined) => {
    const amount = Number(minor || 0) / 100;
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: gym?.currency || 'USD',
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return amount.toFixed(2) + ' ' + (gym?.currency || 'USD');
    }
  };

  const visibleMembers = members.filter(member => {
    const query = search.toLowerCase();
    return `${member.first_name} ${member.last_name} ${member.email || ''} ${member.member_no}`
      .toLowerCase().includes(query);
  });

  if (loading) {
    return <div className="loading-screen" dir={direction}><LanguagePicker language={language} setLanguage={setLanguage} t={t} /><div className="brand-symbol">F</div><p>{t("Loading FitOS…")}</p></div>;
  }

  if (!user) {
    return (
      <main className="auth-page" dir={direction}>
        <section className="auth-card">
          <LanguagePicker language={language} setLanguage={setLanguage} t={t} />
          <div className="auth-brand"><div className="brand-symbol">F</div><span>FitOS</span></div>
          <p className="eyebrow">{t("FITNESS MANAGEMENT")}</p>
          <h1>{t(authMode === 'login' ? 'Welcome back' : 'Create your workspace')}</h1>
          <p className="muted">
            {authMode === 'login'
              ? t('Sign in to manage your gym.')
              : t('Create an owner account and your first gym.')}
          </p>
          {error && <div className="alert error">{error}</div>}
          <form className="auth-form" onSubmit={handleAuth}>
            {authMode === 'register' && <>
              <label>{t("Full name")}<input name="fullName" autoComplete="name" required minLength={2} maxLength={150} /></label>
              <label>{t("Gym name")}<input name="gymName" required minLength={2} maxLength={150} /></label>
            </>}
            <label>{t("Email")}<input name="email" type="email" autoComplete="email" required maxLength={255} /></label>
            <label>{t("Password")}<input name="password" type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} required minLength={authMode === 'register' ? 12 : 1} /></label>
            {authMode === 'register' && <p className="hint">Use at least 12 characters for your password.</p>}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? t('Please wait…') : t(authMode === 'login' ? 'Sign in' : 'Create account')}
            </button>
          </form>
          <p className="auth-switch">
            {authMode === 'login' ? t('New to FitOS?') : t('Already have an account?')}{' '}
            <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(''); }}>
              {authMode === 'login' ? t('Create an account') : t('Sign in')}
            </button>
          </p>
          <p className="hint">Your data is loaded from your FitOS account and gym database.</p>
        </section>
      </main>
    );
  }

  return (
    <div className="dashboard" dir={direction}>
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-symbol">F</div><span>FitOS</span>
          <button className="mobile-close" onClick={() => setMobileMenu(false)}>×</button>
        </div>
        <div className="workspace-label">{t("WORKSPACE")}</div>
        <div className="gym-selector">
          <div className="gym-avatar">{(gym?.name || 'G').slice(0, 1).toUpperCase()}</div>
          <div className="gym-name"><strong>{gym?.name || 'Your gym'}</strong><small>{gym?.role || 'Workspace'}</small></div>
        </div>
        <div className="menu-label">{t("MAIN MENU")}</div>
        <nav className="side-menu">
          {menu.map(item => (
            <button key={item.label}
              className={`menu-item ${active === item.label ? 'active' : ''}`}
              onClick={() => { setActive(item.label); setMobileMenu(false); setError(''); }}>
              <span className="menu-icon">{item.icon}</span>{t(item.label)}
              {item.label === 'Members' && <span className="menu-count">{members.length}</span>}
            </button>
          ))}
          {isPlatformOwner && <>
            <div className="menu-label">{t('PLATFORM ADMIN')}</div>
            {[
              { label: 'Platform Overview', icon: '⌂' },
              { label: 'Platform Gyms', icon: '▦' },
              { label: 'Platform Plans', icon: '◈' },
              { label: 'Platform Audit', icon: '▤' },
            ].map(item => (
              <button key={item.label}
                className={`menu-item ${active === item.label ? 'active' : ''}`}
                onClick={() => { setActive(item.label); setMobileMenu(false); setError(''); }}>
                <span className="menu-icon">{item.icon}</span>{t(item.label)}
              </button>
            ))}
          </>}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon">✦</div>
            <strong>{t("Your gym, your data")}</strong>
            <p>{t("Dashboard metrics are read from your database.")}</p>
          </div>
          <div className="profile">
            <div className="profile-avatar">{(user.fullName || user.email).slice(0, 1).toUpperCase()}</div>
            <div className="profile-info"><strong>{user.fullName}</strong><small>{user.email}</small></div>
            <button className="logout-button" onClick={logout} disabled={busy} title={t("Sign out")}>↪</button>
          </div>
        </div>
      </aside>

      {mobileMenu && <button aria-label="Close menu" className="sidebar-overlay" onClick={() => setMobileMenu(false)} />}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-button" onClick={() => setMobileMenu(true)}>☰</button>
            <div><div className="breadcrumb">{t("WORKSPACE")} / <span>{t(active)}</span></div><h1>{t(active)}</h1></div>
          </div>
          <div className="topbar-actions"><LanguagePicker language={language} setLanguage={setLanguage} t={t} /><span className="live-dot" /> <span className="muted">{t("Connected")}</span></div>
        </header>

        <div className="content-area">
          {error && <div className="alert error">{error}<button onClick={() => setError('')}>×</button></div>}
          {notice && <div className="alert success">{notice}<button onClick={() => setNotice('')}>×</button></div>}

          {active === 'Overview' && <>
            <section className="welcome-row">
              <div><p className="eyebrow">{t("YOUR WORKSPACE")}</p><h2>{t("Welcome")}, {user.fullName.split(' ')[0]}.</h2><p className="muted">{t("Here is what your gym database reports right now.")}</p></div>
              <button className="secondary-button" onClick={() => loadWorkspace(user).catch(err => setError(err.message))}>{t("Refresh data")}</button>
            </section>
            <section className="stats-grid">
              <article className="stat-card"><div className="stat-top"><span>{t("Total Members")}</span><span className="stat-icon cyan">♙</span></div><div className="stat-value">{number(stats?.total_members)}</div><div className="stat-bottom">Database count · archived members excluded</div></article>
              <article className="stat-card"><div className="stat-top"><span>{t("Monthly Revenue")}</span><span className="stat-icon purple">$</span></div><div className="stat-value">{money(stats?.monthly_revenue_minor)}</div><div className="stat-bottom">Paid payments this month</div></article>
              <article className="stat-card"><div className="stat-top"><span>{t("Today's Attendance")}</span><span className="stat-icon green">◷</span></div><div className="stat-value">{number(stats?.today_attendance)}</div><div className="stat-bottom">Check-ins today, gym local time</div></article>
              <article className="stat-card"><div className="stat-top"><span>{t("Active Memberships")}</span><span className="stat-icon orange">◈</span></div><div className="stat-value">{number(stats?.active_memberships)}</div><div className="stat-bottom">Active and within membership dates</div></article>
            </section>
            <section className="panel members-panel">
              <div className="panel-heading"><div><h3>{t("Recently added members")}</h3><p>{t("Latest records from your gym database.")}</p></div><button className="text-link" onClick={() => setActive('Members')}>{t("View members →")}</button></div>
              <MemberTable members={members.slice(0, 5)} />
            </section>
            <p className="hint page-note">Growth percentages and revenue charts are hidden until reliable historical data is available.</p>
          </>}

          {active === 'Members' && <>
            <section className="welcome-row">
              <div><p className="eyebrow">MEMBER DIRECTORY</p><h2>{t("Members")}</h2><p className="muted">{members.length} records loaded from the database.</p></div>
              <button className="primary-button compact" onClick={() => setShowMemberForm(!showMemberForm)}>{showMemberForm ? t('Cancel') : '+ ' + t('Add member')}</button>
            </section>
            {showMemberForm && <section className="panel form-panel"><h3>{t("Add a member")}</h3>
              <form className="member-form" onSubmit={addMember}>
                <label>{t("First name")}<input name="firstName" required maxLength={100} /></label>
                <label>{t("Last name")}<input name="lastName" required maxLength={100} /></label>
                <label>{t("Email (optional)")}<input name="email" type="email" maxLength={255} /></label>
                <label>{t("Phone (optional)")}<input name="phone" maxLength={40} /></label>
                <button className="primary-button" disabled={busy} type="submit">{busy ? t('Saving…') : t('Save member')}</button>
              </form>
            </section>}
            <section className="panel members-panel">
              <div className="panel-heading"><div><h3>{t("All recent members")}</h3><p>Showing up to 100 newest records.</p></div><input className="search-input" placeholder={t("Search members…")} value={search} onChange={event => setSearch(event.target.value)} /></div>
              <MemberTable members={visibleMembers} />
            </section>
          </>}

          {isPlatformOwner && active === 'Platform Overview' && <>
            <section className="welcome-row">
              <div><p className="eyebrow">FITOS CONTROL CENTER</p><h2>Platform overview</h2>
                <p className="muted">Live totals from the platform database.</p></div>
              <button className="secondary-button" disabled={platformLoading}
                onClick={() => { setPlatformLoading(true); refreshPlatform().catch(err => setError(err.message)).finally(() => setPlatformLoading(false)); }}>
                {platformLoading ? 'Refreshing…' : 'Refresh platform'}
              </button>
            </section>
            <section className="stats-grid">
              <article className="stat-card"><div className="stat-top"><span>Total gyms</span><span className="stat-icon cyan">▦</span></div><div className="stat-value">{Number(platformStats?.total_gyms || 0).toLocaleString()}</div></article>
              <article className="stat-card"><div className="stat-top"><span>Active gyms</span><span className="stat-icon green">✓</span></div><div className="stat-value">{Number(platformStats?.active_gyms || 0).toLocaleString()}</div></article>
              <article className="stat-card"><div className="stat-top"><span>Suspended gyms</span><span className="stat-icon orange">!</span></div><div className="stat-value">{Number(platformStats?.suspended_gyms || 0).toLocaleString()}</div></article>
              <article className="stat-card"><div className="stat-top"><span>Active subscriptions</span><span className="stat-icon purple">◈</span></div><div className="stat-value">{Number(platformStats?.active_subscriptions || 0).toLocaleString()}</div></article>
            </section>
            <section className="panel members-panel">
              <div className="panel-heading"><div><h3>Recently registered gyms</h3><p>Actual records from the platform API.</p></div>
                <button className="text-link" onClick={() => setActive('Platform Gyms')}>Manage gyms →</button></div>
              <div className="table-wrap"><table><thead><tr><th>GYM</th><th>OWNER</th><th>STATUS</th><th>PLAN</th></tr></thead>
                <tbody>{platformGyms.slice(0, 8).map(g => <tr key={g.id}>
                  <td><strong>{g.name}</strong><small>{g.slug || `ID ${g.id}`}</small></td>
                  <td>{g.owner_email || '—'}</td>
                  <td><span className={`status-pill ${g.status === 'active' ? 'status-active' : 'status-other'}`}>{g.status || 'unknown'}</span></td>
                  <td>{g.plan_name || 'No plan'}</td>
                </tr>)}</tbody></table></div>
            </section>
            <p className="hint page-note">Plans: {platformStats?.total_plans ?? 0}. Subscriptions needing attention: {platformStats?.attention_subscriptions ?? 0}.</p>
          </>}

          {isPlatformOwner && active === 'Platform Gyms' && <>
            <section className="welcome-row"><div><p className="eyebrow">PLATFORM ADMIN</p><h2>Gym management</h2>
              <p className="muted">{platformGyms.length} gym records returned by the API.</p></div>
              <button className="secondary-button" disabled={platformLoading}
                onClick={() => refreshPlatform().catch(err => setError(err.message))}>Refresh</button></section>
            <section className="panel members-panel"><div className="table-wrap"><table>
              <thead><tr><th>GYM</th><th>OWNER EMAIL</th><th>STATUS</th><th>SUBSCRIPTION</th><th>ASSIGN PLAN</th><th>ACTION</th></tr></thead>
              <tbody>{platformGyms.map(g => <tr key={g.id}>
                <td><strong>{g.name}</strong><small>{g.slug || `ID ${g.id}`} · {g.currency || 'USD'}</small></td>
                <td>{g.owner_email || '—'}</td>
                <td><span className={`status-pill ${g.status === 'active' ? 'status-active' : 'status-other'}`}>{g.status || 'unknown'}</span></td>
                <td>{g.plan_name || 'No plan'}<small>{g.subscription_status || 'unassigned'}{g.subscription_ends_at ? ` · ends ${new Date(g.subscription_ends_at).toLocaleDateString()}` : ''}</small></td>
                <td><div className="platform-assign">
                  <select aria-label={`Plan for ${g.name}`} id={`plan-${g.id}`} defaultValue="">
                    <option value="">Choose plan…</option>
                    {platformPlans.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name} · {(Number(p.price_minor) / 100).toFixed(2)} {p.currency}</option>)}
                  </select>
                  <button className="secondary-button compact" disabled={busy || !platformPlans.some(p => p.is_active)}
                    onClick={() => { const el = document.getElementById(`plan-${g.id}`) as HTMLSelectElement | null; assignPlan(g.id, Number(el?.value || 0)); }}>Assign</button>
                </div></td>
                <td><button className={g.status === 'active' ? 'secondary-button compact' : 'primary-button compact'}
                  disabled={busy} onClick={() => changeGymStatus(g.id, g.status === 'active' ? 'suspended' : 'active')}>
                  {g.status === 'active' ? 'Suspend' : 'Activate'}
                </button></td>
              </tr>)}</tbody></table></div></section>
            <p className="hint page-note">Suspending a gym changes its status in the database. Confirm your target before applying status changes.</p>
          </>}

          {isPlatformOwner && active === 'Platform Plans' && <>
            <section className="welcome-row"><div><p className="eyebrow">SUBSCRIPTION MANAGEMENT</p><h2>Plans</h2>
              <p className="muted">Create plans that can be assigned to gyms.</p></div>
              <button className="primary-button compact" onClick={() => setShowPlanForm(v => !v)}>{showPlanForm ? 'Cancel' : '+ Create plan'}</button></section>
            {showPlanForm && <section className="panel form-panel"><h3>New subscription plan</h3>
              <form className="member-form" onSubmit={createPlatformPlan}>
                <label>Plan name<input name="name" required minLength={2} maxLength={100} /></label>
                <label>Description<input name="description" maxLength={2000} /></label>
                <label>Price per period<input name="price" type="number" min="0" step="0.01" required defaultValue="0" /></label>
                <label>Currency (3 letters)<input name="currency" required minLength={3} maxLength={3} defaultValue="USD" /></label>
                <label>Duration in days<input name="durationDays" type="number" min="1" max="3650" required defaultValue="30" /></label>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create plan'}</button>
              </form>
            </section>}
            <section className="panel members-panel"><div className="table-wrap"><table>
              <thead><tr><th>PLAN</th><th>DESCRIPTION</th><th>PRICE</th><th>DURATION</th><th>STATUS</th></tr></thead>
              <tbody>{platformPlans.map(p => <tr key={p.id}>
                <td><strong>{p.name}</strong><small>Plan #{p.id}</small></td><td>{p.description || '—'}</td>
                <td>{(Number(p.price_minor) / 100).toFixed(2)} {p.currency}</td><td>{p.duration_days} days</td>
                <td><span className={`status-pill ${p.is_active ? 'status-active' : 'status-other'}`}>{p.is_active ? 'Active' : 'Inactive'}</span></td>
              </tr>)}</tbody></table></div></section>
          </>}

          {isPlatformOwner && active === 'Platform Audit' && <>
            <section className="welcome-row"><div><p className="eyebrow">SECURITY & ACCOUNTABILITY</p><h2>Audit log</h2>
              <p className="muted">Latest platform events returned by the audit API.</p></div>
              <button className="secondary-button" onClick={() => refreshPlatform().catch(err => setError(err.message))}>Refresh</button></section>
            <section className="panel members-panel"><div className="table-wrap"><table>
              <thead><tr><th>TIME</th><th>ACTOR ID</th><th>ACTION</th><th>TARGET</th><th>DETAILS</th></tr></thead>
              <tbody>{platformAudit.map(e => <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString()}</td><td>{e.actor_user_id ?? '—'}</td>
                <td><strong>{e.action}</strong></td><td>{e.target_type} {e.target_id ?? ''}</td>
                <td><code>{JSON.stringify(e.details ?? {})}</code></td>
              </tr>)}</tbody></table></div>
              {!platformAudit.length && <p className="hint">No audit events were returned.</p>}
            </section>
          </>}

          {active !== 'Overview' && active !== 'Members' &&
            !(isPlatformOwner && ['Platform Overview', 'Platform Gyms', 'Platform Plans', 'Platform Audit'].includes(active)) &&
            <section className="panel coming-soon">
            <div className="coming-icon">◈</div><h2>{t(active)}</h2>
            <p>{t("This section is not connected to a working backend yet.")}</p>
            <p className="muted">{t("FitOS will not display invented records here.")}</p>
            <button className="secondary-button" onClick={() => setActive('Overview')}>{t("Back to overview")}</button>
          </section>}
        </div>
      </main>
    </div>
  );
}


function LanguagePicker({ language, setLanguage, t }: {
  language: string;
  setLanguage: (value: string) => void;
  t: (key: string) => string;
}) {
  return (
    <label className="language-picker">
      <span aria-hidden="true">◎</span>
      <span className="language-label">{t('Language')}</span>
      <select aria-label={t('Language')} value={language} onChange={event => setLanguage(event.target.value)}>
        {languages.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
    </label>
  );
}

function MemberTable({ members }: { members: Member[] }) {
  const language = (() => { try { return localStorage.getItem("fitos-language") || "en"; } catch { return "en"; } })();
  const t = (key: string) => translate(language, key);
  if (!members.length) {
    return <div className="empty-state"><span>♙</span><strong>{t("No members found")}</strong><p>{t("Add a member or try a different search.")}</p></div>;
  }
  return <div className="table-wrap"><table>
    <thead><tr><th>{t("MEMBER")}</th><th>{t("MEMBER ID")}</th><th>{t("EMAIL / PHONE")}</th><th>{t("STATUS")}</th></tr></thead>
    <tbody>{members.map(member => <tr key={member.id}>
      <td><div className="member-cell"><div className="member-avatar">{(member.first_name[0] || '') + (member.last_name[0] || '')}</div><div><strong>{member.first_name} {member.last_name}</strong><small>Added {new Date(member.created_at).toLocaleDateString()}</small></div></div></td>
      <td>{member.member_no}</td>
      <td>{member.email || member.phone || '—'}{member.email && member.phone && <small className="cell-subtitle">{member.phone}</small>}</td>
      <td><span className={`status-pill ${member.status === 'active' ? 'status-active' : 'status-other'}`}>{member.status}</span></td>
    </tr>)}</tbody>
  </table></div>;
}

export default App;
