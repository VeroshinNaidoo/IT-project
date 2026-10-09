import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const screens = [
  'Dashboard',
  'Modules',
  'Study groups',
  'Leaderboard',
  'Analytics',
];
function App() {
  const [screen, setScreen] = useState('Dashboard');
  const [role, setRole] = useState('student');
  return (
    <div className="shell">
      <aside>
        <div className="brand">EduQuest</div>
        <div className="role-switch">
          <button
            className={role === 'student' ? 'active' : ''}
            onClick={() => setRole('student')}
          >
            Student
          </button>
          <button
            className={role === 'lecturer' ? 'active' : ''}
            onClick={() => setRole('lecturer')}
          >
            Lecturer
          </button>
        </div>
        {screens
          .filter((item) =>
            role === 'student' ? item !== 'Analytics' : item !== 'Study groups',
          )
          .map((item) => (
            <button className="nav" key={item} onClick={() => setScreen(item)}>
              {item}
            </button>
          ))}
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">
              {role === 'student' ? 'LEARNING HUB' : 'LECTURER HUB'}
            </span>
            <h1>{screen}</h1>
          </div>
          <span className="avatar">EQ</span>
        </header>
        {screen === 'Leaderboard' ? (
          <Leaderboard />
        ) : screen === 'Analytics' ? (
          <Analytics />
        ) : screen === 'Modules' ? (
          <Modules role={role} />
        ) : (
          <Dashboard role={role} />
        )}
      </main>
    </div>
  );
}
function Dashboard({ role }) {
  return (
    <section className="grid">
      <article className="card hero">
        <span className="eyebrow">
          {role === 'student' ? 'KEEP GOING' : 'CLASS PULSE'}
        </span>
        <h2>
          {role === 'student'
            ? 'Your next win is waiting.'
            : 'Your modules at a glance.'}
        </h2>
        <p>
          {role === 'student'
            ? 'Continue your Database Systems revision and build your streak.'
            : 'See progress, weak topics, and group momentum from one place.'}
        </p>
        <button className="primary">Open workspace</button>
      </article>
      <article className="card stat">
        <strong>72%</strong>
        <span>Average progress</span>
      </article>
      <article className="card stat amber">
        <strong>3</strong>
        <span>Topics to revisit</span>
      </article>
    </section>
  );
}
function Modules({ role }) {
  return (
    <section className="grid">
      <article className="card">
        <span className="eyebrow">
          {role === 'student' ? 'ENROLLED MODULE' : 'YOUR MODULE'}
        </span>
        <h2>Database Systems</h2>
        <p>Normalization, SQL, transactions and design thinking.</p>
        <button className="primary">View module</button>
      </article>
      <article className="card">
        <span className="eyebrow">NEXT ACTIVITY</span>
        <h2>Competitive quiz</h2>
        <div className="warning">One scored attempt only.</div>
        <button className="secondary">Start quiz</button>
        <QuizGames quizId={null} />
      </article>
    </section>
  );
}

function QuizGames({ quizId }) {
  const [games, setGames] = useState([]);
  const [error, setError] = useState('');
  React.useEffect(() => {
    if (!quizId) return;
    fetch(`/api/v1/quizzes/${quizId}/games`, { credentials: 'include' })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error('Unable to load games.')),
      )
      .then((body) => setGames(body.data))
      .catch((reason) => setError(reason.message));
  }, [quizId]);
  if (error) return <p className="field-error">{error}</p>;
  if (!games.length) return <p className="empty-state">Games coming soon.</p>;
  return (
    <div className="games-area">
      <span className="eyebrow">GAMES</span>
      {games.map((game) => (
        <span key={game.game_id}>{game.display_name}</span>
      ))}
    </div>
  );
}
function Leaderboard() {
  return (
    <section>
      <div className="podium">
        <div className="place second">
          2<span>Sam</span>
        </div>
        <div className="place first">
          1<span>Alex</span>
        </div>
        <div className="place third">
          3<span>Lee</span>
        </div>
      </div>
      <article className="card">
        <div className="toggle">
          <button className="active">Module</button>
          <button>My group</button>
        </div>
        <ol className="ranking">
          <li>
            <span>Alex</span>
            <b>92%</b>
          </li>
          <li>
            <span>Sam</span>
            <b>88%</b>
          </li>
          <li>
            <span>Lee</span>
            <b>84%</b>
          </li>
        </ol>
      </article>
    </section>
  );
}
function Analytics() {
  return (
    <section className="grid">
      <article className="card stat">
        <strong>68%</strong>
        <span>Module average</span>
      </article>
      <article className="card stat">
        <strong>74%</strong>
        <span>Completion rate</span>
      </article>
      <article className="card">
        <span className="eyebrow">WEAKEST TOPICS</span>
        <h2>3NF</h2>
        <p>42% correctness across scored attempts.</p>
        <div className="bar">
          <i />
        </div>
      </article>
    </section>
  );
}
createRoot(document.getElementById('root')).render(<App />);
