import { useState } from 'react';
import './App.css';

const menu = [
  { icon: '⌂', label: 'Overview' },
  { icon: '♙', label: 'Members' },
  { icon: '◈', label: 'Memberships' },
  { icon: '▦', label: 'Classes & Booking' },
  { icon: '♧', label: 'Coaches' },
  { icon: '◷', label: 'Attendance' },
  { icon: '＄', label: 'Finance & POS' },
  { icon: '▤', label: 'Reports' },
  { icon: '⚙', label: 'Settings' },
];

const members = [
  { name: 'Alex Morgan', email: 'alex@example.com', plan: 'Premium', status: 'Active', color: 'cyan' },
  { name: 'Sarah Wilson', email: 'sarah@example.com', plan: 'Standard', status: 'Active', color: 'purple' },
  { name: 'Daniel Smith', email: 'daniel@example.com', plan: 'Premium', status: 'Active', color: 'green' },
  { name: 'Emma Johnson', email: 'emma@example.com', plan: 'Basic', status: 'Pending', color: 'orange' },
];

function App() {
  const [active, setActive] = useState('Overview');
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="dashboard">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-symbol">F</div>
          <span>FitOS</span>
          <button className="mobile-close" onClick={() => setMobileMenu(false)}>×</button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <div className="gym-selector">
          <div className="gym-avatar">A</div>
          <div>
            <strong>Atlas Fitness</strong>
            <small>Main Branch</small>
          </div>
          <span className="selector-arrow">⌄</span>
        </div>

        <div className="menu-label">MAIN MENU</div>

        <nav className="side-menu">
          {menu.map((item) => (
            <button
              key={item.label}
              className={`menu-item ${active === item.label ? 'active' : ''}`}
              onClick={() => {
                setActive(item.label);
                setMobileMenu(false);
              }}
            >
              <span className="menu-icon">{item.icon}</span>
              {item.label}
              {item.label === 'Members' && <span className="menu-count">24</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon">✦</div>
            <strong>Unlock more with FitOS</strong>
            <p>Grow your fitness business with powerful tools.</p>
            <button>Explore plans →</button>
          </div>

          <div className="profile">
            <div className="profile-avatar">JD</div>
            <div>
              <strong>James Davis</strong>
              <small>Gym Administrator</small>
            </div>
            <span>•••</span>
          </div>
        </div>
      </aside>

      {mobileMenu && <div className="sidebar-overlay" onClick={() => setMobileMenu(false)} />}

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-button" onClick={() => setMobileMenu(true)}>☰</button>
            <div>
              <div className="breadcrumb">Workspace / <span>{active}</span></div>
              <h1>{active}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <button className="icon-button">⌕</button>
            <button className="icon-button notification">♧<i /></button>
            <div className="topbar-avatar">JD</div>
          </div>
        </header>

        <div className="content-area">
          <section className="welcome-row">
            <div>
              <h2>Good morning, James <span>✦</span></h2>
              <p>Here's what's happening with your gym today.</p>
            </div>
            <button className="date-button">▦ &nbsp; October 20, 2026</button>
          </section>

          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-top"><span>Total Members</span><span className="stat-icon cyan">♙</span></div>
              <div className="stat-value">1,284</div>
              <div className="stat-bottom"><span className="positive">↗ 12.8%</span><span>vs last month</span></div>
              <div className="mini-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
            </article>

            <article className="stat-card">
              <div className="stat-top"><span>Monthly Revenue</span><span className="stat-icon purple">$</span></div>
              <div className="stat-value">$24,580</div>
              <div className="stat-bottom"><span className="positive">↗ 8.4%</span><span>vs last month</span></div>
              <div className="mini-bars purple-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
            </article>

            <article className="stat-card">
              <div className="stat-top"><span>Today's Attendance</span><span className="stat-icon green">◷</span></div>
              <div className="stat-value">186</div>
              <div className="stat-bottom"><span className="positive">↗ 6.2%</span><span>vs yesterday</span></div>
              <div className="mini-bars green-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
            </article>

            <article className="stat-card">
              <div className="stat-top"><span>Active Memberships</span><span className="stat-icon orange">◈</span></div>
              <div className="stat-value">968</div>
              <div className="stat-bottom"><span className="positive">↗ 4.6%</span><span>vs last month</span></div>
              <div className="mini-bars orange-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
            </article>
          </section>

          <section className="middle-grid">
            <article className="panel revenue-panel">
              <div className="panel-heading">
                <div><h3>Revenue Overview</h3><p>Track your gym's financial performance</p></div>
                <button className="select-button">Last 7 months⌄</button>
              </div>

              <div className="chart-total">$148,320 <span>↗ 14.6%</span></div>
              <div className="chart-subtitle">Total revenue this period</div>

              <div className="chart">
                <div className="chart-labels"><span>$30k</span><span>$20k</span><span>$10k</span><span>$0</span></div>
                <div className="chart-lines">
                  <div className="chart-line"/><div className="chart-line"/><div className="chart-line"/><div className="chart-line"/>
                  <svg viewBox="0 0 600 180" preserveAspectRatio="none">
                    <defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity=".27"/><stop offset="100%" stopColor="#22d3ee" stopOpacity="0"/></linearGradient></defs>
                    <path d="M0 145 C50 130 65 115 100 125 S170 95 200 105 S270 75 300 90 S370 55 400 70 S470 35 500 55 S560 15 600 25 L600 180 L0 180 Z" fill="url(#area)"/>
                    <path d="M0 145 C50 130 65 115 100 125 S170 95 200 105 S270 75 300 90 S370 55 400 70 S470 35 500 55 S560 15 600 25" fill="none" stroke="#22d3ee" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
                  </svg>
                </div>
              </div>
              <div className="chart-months"><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span></div>
            </article>

            <article className="panel schedule-panel">
              <div className="panel-heading">
                <div><h3>Today's Classes</h3><p>Your upcoming sessions</p></div>
                <button className="text-link">View all →</button>
              </div>

              <div className="class-item"><div className="class-time">08:00<small>AM</small></div><div className="class-color cyan-bg"/><div className="class-info"><strong>Morning Yoga</strong><small>Olivia Chen · Studio A</small></div><span className="class-attendees">18/20</span></div>
              <div className="class-item"><div className="class-time">10:30<small>AM</small></div><div className="class-color purple-bg"/><div className="class-info"><strong>HIIT Training</strong><small>Marcus Lee · Studio B</small></div><span className="class-attendees">14/16</span></div>
              <div className="class-item"><div className="class-time">01:00<small>PM</small></div><div className="class-color green-bg"/><div className="class-info"><strong>Strength Training</strong><small>Daniel Reed · Gym Floor</small></div><span className="class-attendees">12/15</span></div>
              <div className="class-item"><div className="class-time">05:30<small>PM</small></div><div className="class-color orange-bg"/><div className="class-info"><strong>Boxing Fitness</strong><small>Alex Carter · Studio C</small></div><span className="class-attendees">16/20</span></div>
            </article>
          </section>

          <section className="panel members-panel">
            <div className="panel-heading">
              <div><h3>Recent Members</h3><p>Latest member registrations</p></div>
              <button className="text-link">View all members →</button>
            </div>

            <div className="table-wrap">
              <table>
                <thead><tr><th>MEMBER</th><th>MEMBERSHIP</th><th>STATUS</th><th>ACTION</th></tr></thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.email}>
                      <td><div className="member-cell"><div className={`member-avatar ${member.color}`}>{member.name.split(' ').map(n => n[0]).join('')}</div><div><strong>{member.name}</strong><small>{member.email}</small></div></div></td>
                      <td>{member.plan}</td>
                      <td><span className={`status-pill ${member.status.toLowerCase()}`}>{member.status}</span></td>
                      <td><button className="more-button">•••</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="dashboard-footer">
            <span>© 2026 FitOS · The Operating System for Fitness Businesses.</span>
            <span>All systems operational <i/></span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
