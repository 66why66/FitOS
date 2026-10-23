import { useCallback, useEffect, useState, type FormEvent } from 'react';
import './App.css';

type User = { id: number; email: string; fullName: string };
type Gym = { id: number; name: string; role?: string; timezone?: string; currency?: string };
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
    return <div className="loading-screen"><div className="brand-symbol">F</div><p>Loading FitOS…</p></div>;
  }

  if (!user) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-brand"><div className="brand-symbol">F</div><span>FitOS</span></div>
          <p className="eyebrow">FITNESS MANAGEMENT</p>
          <h1>{authMode === 'login' ? 'Welcome back' : 'Create your workspace'}</h1>
          <p className="muted">
            {authMode === 'login'
              ? 'Sign in to manage your gym.'
              : 'Create an owner account and your first gym.'}
          </p>
          {error && <div className="alert error">{error}</div>}
          <form className="auth-form" onSubmit={handleAuth}>
            {authMode === 'register' && <>
              <label>Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={150} /></label>
              <label>Gym name<input name="gymName" required minLength={2} maxLength={150} /></label>
            </>}
            <label>Email<input name="email" type="email" autoComplete="email" required maxLength={255} /></label>
            <label>Password<input name="password" type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} required minLength={authMode === 'register' ? 12 : 1} /></label>
            {authMode === 'register' && <p className="hint">Use at least 12 characters for your password.</p>}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <p className="auth-switch">
            {authMode === 'login' ? 'New to FitOS?' : 'Already have an account?'}{' '}
            <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(''); }}>
              {authMode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          <p className="hint">Your data is loaded from your FitOS account and gym database.</p>
        </section>
      </main>
    );
  }

  return (
    <div className="dashboard">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-symbol">F</div><span>FitOS</span>
          <button className="mobile-close" onClick={() => setMobileMenu(false)}>×</button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="gym-selector">
          <div className="gym-avatar">{(gym?.name || 'G').slice(0, 1).toUpperCase()}</div>
          <div className="gym-name"><strong>{gym?.name || 'Your gym'}</strong><small>{gym?.role || 'Workspace'}</small></div>
        </div>
        <div className="menu-label">MAIN MENU</div>
        <nav className="side-menu">
          {menu.map(item => (
            <button key={item.label}
              className={`menu-item ${active === item.label ? 'active' : ''}`}
              onClick={() => { setActive(item.label); setMobileMenu(false); setError(''); }}>
              <span className="menu-icon">{item.icon}</span>{item.label}
              {item.label === 'Members' && <span className="menu-count">{members.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon">✦</div>
            <strong>Your gym, your data</strong>
            <p>Dashboard metrics are read from your database.</p>
          </div>
          <div className="profile">
            <div className="profile-avatar">{(user.fullName || user.email).slice(0, 1).toUpperCase()}</div>
            <div className="profile-info"><strong>{user.fullName}</strong><small>{user.email}</small></div>
            <button className="logout-button" onClick={logout} disabled={busy} title="Sign out">↪</button>
          </div>
        </div>
      </aside>

      {mobileMenu && <button aria-label="Close menu" className="sidebar-overlay" onClick={() => setMobileMenu(false)} />}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-button" onClick={() => setMobileMenu(true)}>☰</button>
            <div><div className="breadcrumb">Workspace / <span>{active}</span></div><h1>{active}</h1></div>
          </div>
          <div className="topbar-actions"><span className="live-dot" /> <span className="muted">Connected</span></div>
        </header>

        <div className="content-area">
          {error && <div className="alert error">{error}<button onClick={() => setError('')}>×</button></div>}
          {notice && <div className="alert success">{notice}<button onClick={() => setNotice('')}>×</button></div>}

          {active === 'Overview' && <>
            <section className="welcome-row">
              <div><p className="eyebrow">YOUR WORKSPACE</p><h2>Welcome, {user.fullName.split(' ')[0]}.</h2><p className="muted">Here is what your gym database reports right now.</p></div>
              <button className="secondary-button" onClick={() => loadWorkspace(user).catch(err => setError(err.message))}>↻ Refresh data</button>
            </section>
            <section className="stats-grid">
              <article className="stat-card"><div className="stat-top"><span>Total Members</span><span className="stat-icon cyan">♙</span></div><div className="stat-value">{number(stats?.total_members)}</div><div className="stat-bottom">Database count · archived members excluded</div></article>
              <article className="stat-card"><div className="stat-top"><span>Monthly Revenue</span><span className="stat-icon purple">$</span></div><div className="stat-value">{money(stats?.monthly_revenue_minor)}</div><div className="stat-bottom">Paid payments this month</div></article>
              <article className="stat-card"><div className="stat-top"><span>Today's Attendance</span><span className="stat-icon green">◷</span></div><div className="stat-value">{number(stats?.today_attendance)}</div><div className="stat-bottom">Check-ins today, gym local time</div></article>
              <article className="stat-card"><div className="stat-top"><span>Active Memberships</span><span className="stat-icon orange">◈</span></div><div className="stat-value">{number(stats?.active_memberships)}</div><div className="stat-bottom">Active and within membership dates</div></article>
            </section>
            <section className="panel members-panel">
              <div className="panel-heading"><div><h3>Recently added members</h3><p>Latest records from your gym database.</p></div><button className="text-link" onClick={() => setActive('Members')}>View members →</button></div>
              <MemberTable members={members.slice(0, 5)} />
            </section>
            <p className="hint page-note">Growth percentages and revenue charts are hidden until reliable historical data is available.</p>
          </>}

          {active === 'Members' && <>
            <section className="welcome-row">
              <div><p className="eyebrow">MEMBER DIRECTORY</p><h2>Members</h2><p className="muted">{members.length} records loaded from the database.</p></div>
              <button className="primary-button compact" onClick={() => setShowMemberForm(!showMemberForm)}>{showMemberForm ? 'Cancel' : '+ Add member'}</button>
            </section>
            {showMemberForm && <section className="panel form-panel"><h3>Add a member</h3>
              <form className="member-form" onSubmit={addMember}>
                <label>First name<input name="firstName" required maxLength={100} /></label>
                <label>Last name<input name="lastName" required maxLength={100} /></label>
                <label>Email (optional)<input name="email" type="email" maxLength={255} /></label>
                <label>Phone (optional)<input name="phone" maxLength={40} /></label>
                <button className="primary-button" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save member'}</button>
              </form>
            </section>}
            <section className="panel members-panel">
              <div className="panel-heading"><div><h3>All recent members</h3><p>Showing up to 100 newest records.</p></div><input className="search-input" placeholder="Search members…" value={search} onChange={event => setSearch(event.target.value)} /></div>
              <MemberTable members={visibleMembers} />
            </section>
          </>}

          {active !== 'Overview' && active !== 'Members' && <section className="panel coming-soon">
            <div className="coming-icon">◈</div><h2>{active}</h2>
            <p>This section is not connected to a working backend yet.</p>
            <p className="muted">FitOS will not display invented records here.</p>
            <button className="secondary-button" onClick={() => setActive('Overview')}>Back to overview</button>
          </section>}
        </div>
      </main>
    </div>
  );
}

function MemberTable({ members }: { members: Member[] }) {
  if (!members.length) {
    return <div className="empty-state"><span>♙</span><strong>No members found</strong><p>Add a member or try a different search.</p></div>;
  }
  return <div className="table-wrap"><table>
    <thead><tr><th>MEMBER</th><th>MEMBER ID</th><th>EMAIL / PHONE</th><th>STATUS</th></tr></thead>
    <tbody>{members.map(member => <tr key={member.id}>
      <td><div className="member-cell"><div className="member-avatar">{(member.first_name[0] || '') + (member.last_name[0] || '')}</div><div><strong>{member.first_name} {member.last_name}</strong><small>Added {new Date(member.created_at).toLocaleDateString()}</small></div></div></td>
      <td>{member.member_no}</td>
      <td>{member.email || member.phone || '—'}{member.email && member.phone && <small className="cell-subtitle">{member.phone}</small>}</td>
      <td><span className={`status-pill ${member.status === 'active' ? 'status-active' : 'status-other'}`}>{member.status}</span></td>
    </tr>)}</tbody>
  </table></div>;
}

export default App;
