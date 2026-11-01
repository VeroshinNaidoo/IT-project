import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const api = async (path, options = {}) => {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message || 'Something went wrong.');
  return body;
};

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', fullName: '' });
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const body = await api(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(
          mode === 'login'
            ? { email: form.email, password: form.password }
            : form,
        ),
      });
      onLogin(body.user);
    } catch (reason) {
      setError(reason.message);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-intro" aria-label="Welcome to EduQuest">
        <span className="intro-label">
          A LITTLE CURIOSITY. A LOT OF POSSIBILITY.
        </span>
        <h2>
          Your next
          <br />
          lightbulb moment
          <br />
          <em>starts here.</em>
        </h2>
        <p>
          Bring your notes, your questions, and your ambition. Make room for a
          better way to learn.
        </p>
        <div className="intro-tags">
          <span>Learn together</span>
          <span>Build confidence</span>
        </div>
        <div className="intro-orbit" aria-hidden="true">
          <span>EQ</span>
        </div>
      </section>
      <form className="card auth-card" onSubmit={submit}>
        <span className="eyebrow">EDUQUEST</span>
        <h1>
          {mode === 'login' ? 'Welcome back' : 'Create your student account'}
        </h1>
        <p className="auth-description">
          {mode === 'login'
            ? 'Your learning journey, all in one place.'
            : 'A fresh start for your next big idea.'}
        </p>
        {mode === 'register' && (
          <label>
            Full name
            <input
              value={form.fullName}
              onChange={(event) =>
                setForm({ ...form, fullName: event.target.value })
              }
              required
            />
            {error && <small className="field-error">{error}</small>}
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm({ ...form, password: event.target.value })
            }
            required
            minLength="8"
          />
        </label>
        {mode === 'register' && (
          <p className="muted">Registration creates a student account.</p>
        )}
        <button className="primary" type="submit">
          {mode === 'login' ? 'Log in' : 'Register'}
        </button>
        <button
          className="link-button"
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? 'Create an account' : 'I already have an account'}
        </button>
        {mode === 'login' && error && <p className="field-error">{error}</p>}
      </form>
    </main>
  );
}

export function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('Dashboard');
  const [quizId, setQuizId] = useState(null);
  const [gameQuizId, setGameQuizId] = useState(null);
  useEffect(() => {
    api('/auth/me')
      .then((body) => setUser(body.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return <main className="center-state">Loading your workspace…</main>;
  if (!user) return <Auth onLogin={setUser} />;
  const studentScreens = [
    'Dashboard',
    'Modules',
    'Resources',
    'Study groups',
    'Leaderboard',
    'Quizzes',
    'Games',
  ];
  const lecturerScreens = [
    'Modules',
    'Resources',
    'Quizzes',
    'Games',
    'Analytics',
  ];
  const screens = user.role === 'student' ? studentScreens : lecturerScreens;
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  };
  return (
    <div className="shell">
      <aside>
        <div className="brand">EduQuest</div>
        <p className="sidebar-user">
          {user.full_name || user.fullName}
          <br />
          <small>{user.role}</small>
        </p>
        {screens.map((item) => (
          <button
            className={`nav ${screen === item ? 'active' : ''}`}
            key={item}
            aria-label={item}
            aria-current={screen === item ? 'page' : undefined}
            onClick={() => setScreen(item)}
          >
            {item}
          </button>
        ))}
        <button className="nav logout" onClick={logout}>
          Log out
        </button>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">
              {user.role === 'student' ? 'LEARNING HUB' : 'LECTURER HUB'}
            </span>
            <h1>{screen}</h1>
            <p className="page-description">
              {screen === 'Dashboard'
                ? 'A little progress, every day.'
                : screen === 'Resources'
                  ? 'Good ideas start with great material.'
                  : screen === 'Quizzes'
                    ? 'Turn what you know into what you can do.'
                    : screen === 'Analytics'
                      ? 'Understand progress. Plan what comes next.'
                      : screen === 'Games'
                        ? 'Choose a practice game and a quiz to play.'
                        : screen === 'Leaderboard'
                          ? 'Celebrate the work behind every achievement.'
                          : 'Everything you need, thoughtfully organised.'}
            </p>
          </div>
          <span className="avatar">
            {(user.full_name || user.fullName || 'EQ')
              .slice(0, 2)
              .toUpperCase()}
          </span>
        </header>
        {screen === 'Dashboard' && <Dashboard user={user} />}
        {screen === 'Modules' && <Modules user={user} />}
        {screen === 'Resources' && <Resources user={user} />}
        {screen === 'Study groups' && <Groups user={user} />}
        {screen === 'Leaderboard' && <Leaderboard user={user} />}
        {screen === 'Analytics' && <Analytics user={user} />}
        {screen === 'Games' && (
          <GamesPage
            user={user}
            onStartGame={(key, id) => {
              setGameQuizId(id);
              const screensByKey = {
                infected: 'Infected',
                island_escape: 'Island Escape',
                memory_match: 'Memory Match',
                boss_battle: 'Boss Battle',
                pixel_racer: 'Pixel Car Racer',
                timer_trivia: 'Timer Trivia',
              };
              setScreen(screensByKey[key] || 'Games');
            }}
          />
        )}
        {screen === 'Quizzes' && (
          <Quizzes
            onTake={(id) => {
              setQuizId(id);
              setScreen('Quiz');
            }}
            onPlayInfected={(id) => {
              setGameQuizId(id);
              setScreen('Infected');
            }}
            onPlayIslandEscape={(id) => {
              setGameQuizId(id);
              setScreen('Island Escape');
            }}
            onPlayMemoryMatch={(id) => {
              setGameQuizId(id);
              setScreen('Memory Match');
            }}
            onPlayBossBattle={(id) => {
              setGameQuizId(id);
              setScreen('Boss Battle');
            }}
            onPlayPixelRacer={(id) => {
              setGameQuizId(id);
              setScreen('Pixel Car Racer');
            }}
            onPlayTimerTrivia={(id) => {
              setGameQuizId(id);
              setScreen('Timer Trivia');
            }}
          />
        )}
        {screen === 'Quiz' && <QuizTaking quizId={quizId} />}
        {screen === 'Infected' && (
          <InfectedGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
        {screen === 'Island Escape' && (
          <IslandEscapeGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
        {screen === 'Memory Match' && (
          <MemoryMatchGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
        {screen === 'Boss Battle' && (
          <BossBattleGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
        {screen === 'Pixel Car Racer' && (
          <PixelRacerGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
        {screen === 'Timer Trivia' && (
          <TimerTriviaGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
      </main>
    </div>
  );
}

function useData(path) {
  const [state, setState] = useState({ loading: true, error: '', data: [] });
  useEffect(() => {
    let live = true;
    api(path)
      .then(
        (body) =>
          live &&
          setState({
            loading: false,
            error: '',
            ...body,
            data: body.data || body.weakTopics || [],
          }),
      )
      .catch(
        (reason) =>
          live && setState({ loading: false, error: reason.message, data: [] }),
      );
    return () => {
      live = false;
    };
  }, [path]);
  return state;
}
function State({ state, empty = 'Nothing here yet.' }) {
  if (state.loading) return <p className="muted">Loading…</p>;
  if (state.error) return <p className="field-error">{state.error}</p>;
  if (!state.data.length) return <p className="empty-state">{empty}</p>;
  return null;
}
function Dashboard({ user }) {
  const state = useData('/modules');
  return (
    <section className="grid">
      <article className="card hero">
        <span className="eyebrow">
          {user.role === 'student' ? 'YOUR LEARNING' : 'YOUR TEACHING'}
        </span>
        <h2>
          {user.role === 'student'
            ? 'Small steps. Big discoveries.'
            : 'Inspire the next discovery.'}
        </h2>
        <p>
          Use the navigation to manage modules, study groups, quizzes and
          results.
        </p>
      </article>
      <article className="card stat">
        <strong>{state.data.length}</strong>
        <span>Visible modules</span>
      </article>
      <article className="card stat amber">
        <strong>{user.role === 'student' ? 'Practice' : 'Insights'}</strong>
        <span>Next focus</span>
      </article>
    </section>
  );
}
export function Modules({ user }) {
  const state = useData('/modules');
  const [createdModules, setCreatedModules] = useState([]);
  const [moduleCode, setModuleCode] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [createMessage, setCreateMessage] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState('');
  const createModule = async (event) => {
    event.preventDefault();
    setCreateMessage('');
    try {
      const body = await api('/modules', {
        method: 'POST',
        body: JSON.stringify({ moduleCode, moduleName }),
      });
      setCreatedModules((items) => [body.module, ...items]);
      setModuleCode('');
      setModuleName('');
      setCreateMessage(
        `Module created. Share JoinCode ${body.module.join_code} with students.`,
      );
    } catch (reason) {
      setCreateMessage(reason.message);
    }
  };
  const join = async (event) => {
    event.preventDefault();
    try {
      await api('/enrollments', {
        method: 'POST',
        body: JSON.stringify({ joinCode }),
      });
      setMessage('Enrolled successfully.');
      setJoinCode('');
    } catch (reason) {
      setMessage(reason.message);
    }
  };
  return (
    <section className="grid">
      <article className="card">
        <span className="eyebrow">MODULES</span>
        <State state={state} empty="No modules are visible yet." />
        {[...createdModules, ...state.data].map((module) => (
          <div className="list-row" key={module.module_id}>
            <span>
              <b>{module.module_name}</b>
              <small>{module.module_code}</small>
            </span>
            <span>
              {module.join_code ? `JoinCode: ${module.join_code}` : ''}
            </span>
          </div>
        ))}
      </article>
      {user.role === 'lecturer' && (
        <form className="card" onSubmit={createModule}>
          <span className="eyebrow">LECTURER TOOLS</span>
          <h2>Create a module</h2>
          <p className="muted">
            Add a module first, then upload resources and generate quizzes from
            them.
          </p>
          <label>
            Module code
            <input
              value={moduleCode}
              onChange={(event) => setModuleCode(event.target.value)}
              placeholder="e.g. CS101"
              required
            />
          </label>
          <label>
            Module name
            <input
              value={moduleName}
              onChange={(event) => setModuleName(event.target.value)}
              placeholder="e.g. Introduction to Computing"
              required
            />
          </label>
          <button className="primary" type="submit">
            Create module
          </button>
          {createMessage && <p className="muted">{createMessage}</p>}
        </form>
      )}
      {user.role === 'student' && (
        <form className="card" onSubmit={join}>
          <h2>Enrol with a JoinCode</h2>
          <label>
            JoinCode
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              required
            />
          </label>
          <button className="primary">Enrol</button>
          {message && <p className="muted">{message}</p>}
        </form>
      )}
    </section>
  );
}
function Resources({ user }) {
  const modules = useData('/modules');
  const [moduleId, setModuleId] = useState('');
  const state = useData(
    moduleId ? `/modules/${moduleId}/resources` : '/modules',
  );
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const upload = async (event) => {
    event.preventDefault();
    setError('');
    const file = event.target.file.files[0];
    const form = new FormData();
    form.append('title', title);
    form.append('file', file);
    try {
      await fetch(`/api/v1/modules/${moduleId}/resources`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      }).then(async (response) => {
        if (!response.ok)
          throw new Error((await response.json()).error.message);
      });
      setTitle('');
    } catch (reason) {
      setError(reason.message);
    }
  };
  return (
    <section className="grid">
      <article className="card">
        <h2>Resources</h2>
        <select
          value={moduleId}
          onChange={(event) => setModuleId(event.target.value)}
        >
          <option value="">Choose a module</option>
          {modules.data.map((module) => (
            <option key={module.module_id} value={module.module_id}>
              {module.module_name}
            </option>
          ))}
        </select>
        <State
          state={moduleId ? state : { loading: false, error: '', data: [] }}
          empty="No resources are visible for this module."
        />
        {state.data.map((resource) => (
          <ResourceRow
            key={resource.resource_id}
            resource={resource}
            lecturer={user.role === 'lecturer'}
          />
        ))}
      </article>
      {user.role === 'lecturer' && (
        <form className="card" onSubmit={upload}>
          <h2>Upload resource</h2>
          <label>
            Module
            <select
              value={moduleId}
              onChange={(event) => setModuleId(event.target.value)}
              required
            >
              <option value="">Choose</option>
              {modules.data.map((module) => (
                <option key={module.module_id} value={module.module_id}>
                  {module.module_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label>
            File
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.md"
              required
            />
          </label>
          <button className="primary">Upload</button>
          {error && <p className="field-error">{error}</p>}
        </form>
      )}
    </section>
  );
}

export function ResourceRow({ resource, lecturer }) {
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState('mixed');
  const [job, setJob] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const generate = async () => {
    setError('');
    setQuiz(null);
    try {
      const body = await api(
        `/resources/${resource.resource_id}/generation-jobs`,
        {
          method: 'POST',
          body: JSON.stringify({
            questionCount: Number(questionCount),
            difficulty,
          }),
        },
      );
      setJob(body.job);
    } catch (reason) {
      setError(reason.message);
    }
  };
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return undefined;
    const poll = async () => {
      try {
        const body = await api(`/ai-generation-jobs/${job.job_id}`);
        setJob(body.job);
        if (body.job.status === 'succeeded' && body.job.quiz_id)
          setQuiz((await api(`/quizzes/${body.job.quiz_id}`)).quiz);
      } catch (reason) {
        setError(reason.message);
      }
    };
    const timer = setInterval(poll, 100);
    poll();
    return () => clearInterval(timer);
  }, [job?.job_id, job?.status]);
  const publish = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = await api(`/quizzes/${quiz.quiz_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: quiz.title,
          isCompetitive: quiz.is_competitive,
          closesAt: quiz.closes_at,
          status: 'published',
          questions: (quiz.questions || []).map((question) => ({
            questionId: question.questionId,
            difficultyLevel: question.difficultyLevel,
            explanation: question.explanation,
          })),
        }),
      });
      setQuiz(body.quiz);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };
  if (!lecturer)
    return (
      <div className="list-row">
        <span>{resource.title}</span>
        <small>{resource.resource_type}</small>
      </div>
    );
  return (
    <div className="card resource-generation">
      <div className="list-row">
        <span>
          <b>{resource.title}</b>
          <small>{resource.resource_type}</small>
        </span>
      </div>
      <div className="generation-controls">
        <label>
          Questions
          <input
            type="number"
            min="1"
            max="50"
            value={questionCount}
            onChange={(event) => setQuestionCount(event.target.value)}
          />
        </label>
        <label>
          Difficulty
          <select
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
          >
            <option value="mixed">Mixed</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <button className="primary" onClick={generate}>
          Generate quiz
        </button>
      </div>
      {job && (
        <p className="job-status" aria-live="polite">
          Generation status: <b>{job.status}</b>
          {job.status === 'failed' && (
            <>
              <span className="field-error">
                Quiz generation failed. Please try again.
              </span>
              <button className="link-button" onClick={generate}>
                Retry
              </button>
            </>
          )}
        </p>
      )}
      {error && <p className="field-error">{error}</p>}
      {quiz && (
        <form onSubmit={publish} className="generated-quiz">
          <h3>Generated draft</h3>
          <label>
            Quiz title
            <input
              value={quiz.title}
              onChange={(event) =>
                setQuiz({ ...quiz, title: event.target.value })
              }
            />
          </label>
          <label>
            Mode
            <select
              value={quiz.is_competitive ? 'competitive' : 'practice'}
              onChange={(event) =>
                setQuiz({
                  ...quiz,
                  is_competitive: event.target.value === 'competitive',
                })
              }
            >
              <option value="practice">Practice</option>
              <option value="competitive">Competitive</option>
            </select>
          </label>
          <div className="draft-questions">
            {quiz.questions?.map((question) => (
              <fieldset key={question.questionId}>
                <legend>{question.questionText}</legend>
                <small>{question.topic || 'No topic'}</small>
                <label>
                  Difficulty
                  <select
                    value={question.difficultyLevel}
                    onChange={(event) =>
                      setQuiz({
                        ...quiz,
                        questions: quiz.questions.map((item) =>
                          item.questionId === question.questionId
                            ? {
                                ...item,
                                difficultyLevel: Number(event.target.value),
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="1">Level 1 — Easy</option>
                    <option value="2">Level 2 — Easy</option>
                    <option value="3">Level 3 — Medium</option>
                    <option value="4">Level 4 — Hard</option>
                    <option value="5">Level 5 — Hard</option>
                  </select>
                </label>
                <label>
                  Explanation
                  <textarea
                    maxLength="300"
                    value={question.explanation || ''}
                    onChange={(event) =>
                      setQuiz({
                        ...quiz,
                        questions: quiz.questions.map((item) =>
                          item.questionId === question.questionId
                            ? { ...item, explanation: event.target.value }
                            : item,
                        ),
                      })
                    }
                    required
                  />
                </label>
              </fieldset>
            ))}
          </div>
          <button className="primary" disabled={saving}>
            {saving ? 'Publishing…' : 'Publish quiz'}
          </button>
        </form>
      )}
    </div>
  );
}
function Groups({ user }) {
  const modules = useData('/modules');
  const [moduleId, setModuleId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [message, setMessage] = useState('');
  const create = async (event) => {
    event.preventDefault();
    try {
      await api(`/modules/${moduleId}/groups`, {
        method: 'POST',
        body: JSON.stringify({ groupName }),
      });
      setMessage('Study group created.');
    } catch (reason) {
      setMessage(reason.message);
    }
  };
  return (
    <section className="card">
      <h2>Study groups</h2>
      <p className="muted">Groups are scoped to an enrolled module.</p>
      <form onSubmit={create}>
        <select
          value={moduleId}
          onChange={(event) => setModuleId(event.target.value)}
          required
        >
          <option value="">Choose a module</option>
          {modules.data.map((module) => (
            <option key={module.module_id} value={module.module_id}>
              {module.module_name}
            </option>
          ))}
        </select>
        <input
          placeholder="Group name"
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
          required
        />
        <button className="primary">Create group</button>
      </form>
      {message && <p className="muted">{message}</p>}
    </section>
  );
}
function Leaderboard({ user }) {
  const modules = useData('/modules');
  const [moduleId, setModuleId] = useState('');
  const state = useData(
    moduleId ? `/modules/${moduleId}/leaderboard` : '/modules',
  );
  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <select
        value={moduleId}
        onChange={(event) => setModuleId(event.target.value)}
      >
        <option value="">Choose a module</option>
        {modules.data.map((module) => (
          <option key={module.module_id} value={module.module_id}>
            {module.module_name}
          </option>
        ))}
      </select>
      {moduleId ? (
        <>
          <State state={state} empty="No completed scored attempts yet." />
          <ol className="ranking">
            {state.data.map((row) => (
              <li key={`${row.student_id}-${row.completion_time}`}>
                <span>
                  {row.rank}. {row.full_name}
                </span>
                <b>{row.score}</b>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="empty-state">Choose a module to view rankings.</p>
      )}
    </section>
  );
}
function Analytics({ user }) {
  const modules = useData('/modules');
  const [moduleId, setModuleId] = useState('');
  const state = useData(
    moduleId ? `/modules/${moduleId}/analytics` : '/modules',
  );
  if (user.role !== 'lecturer')
    return <p className="field-error">You do not have access to analytics.</p>;
  return (
    <section className="card">
      <h2>Analytics</h2>
      <select
        value={moduleId}
        onChange={(event) => setModuleId(event.target.value)}
      >
        <option value="">Choose a module</option>
        {modules.data.map((module) => (
          <option key={module.module_id} value={module.module_id}>
            {module.module_name}
          </option>
        ))}
      </select>
      <State state={state} empty="No scored data yet." />
      {state.data.map((topic) => (
        <div className="list-row" key={topic.topic_id}>
          <span>{topic.name}</span>
          <b>
            {topic.correctness_percentage ?? 'No answers yet'}
            {topic.correctness_percentage !== null ? '%' : ''}
          </b>
        </div>
      ))}
    </section>
  );
}
export function Quizzes({
  onTake,
  onPlayInfected,
  onPlayIslandEscape,
  onPlayMemoryMatch,
  onPlayBossBattle,
  onPlayPixelRacer,
  onPlayTimerTrivia,
}) {
  const modules = useData('/modules');
  const [moduleId, setModuleId] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const quizzes = useData(
    moduleId
      ? `/modules/${moduleId}/quizzes?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`
      : '/modules',
  );
  return (
    <section className="card">
      <h2>Quizzes</h2>
      <p className="muted">
        Published quizzes are loaded from the API. AI generation progress is
        reported by the job status endpoint.
      </p>
      <select
        value={moduleId}
        onChange={(event) => {
          setModuleId(event.target.value);
          setPage(1);
        }}
      >
        <option value="">Choose a module</option>
        {modules.data.map((module) => (
          <option key={module.module_id} value={module.module_id}>
            {module.module_name}
          </option>
        ))}
      </select>
      {moduleId ? (
        <>
          <label htmlFor="quiz-search">Search quizzes</label>
          <input
            id="quiz-search"
            value={search}
            placeholder="Search by title"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <State state={quizzes} empty="No published quizzes yet." />
          {quizzes.data.map((quiz) => (
            <div className="quiz-entry" key={quiz.quiz_id}>
              <div className="list-row">
                <span>
                  {quiz.title}
                  <small>
                    {quiz.is_competitive
                      ? 'One scored attempt only.'
                      : 'Practice quiz'}
                  </small>
                </span>
                <button
                  className="secondary"
                  onClick={() => onTake(quiz.quiz_id)}
                >
                  Open quiz
                </button>
              </div>
              <QuizGames
                quizId={quiz.quiz_id}
                onPlayInfected={() => onPlayInfected(quiz.quiz_id)}
                onPlayIslandEscape={() => onPlayIslandEscape(quiz.quiz_id)}
                onPlayMemoryMatch={() => onPlayMemoryMatch(quiz.quiz_id)}
                onPlayBossBattle={() => onPlayBossBattle(quiz.quiz_id)}
                onPlayPixelRacer={() => onPlayPixelRacer(quiz.quiz_id)}
                onPlayTimerTrivia={() => onPlayTimerTrivia(quiz.quiz_id)}
              />
            </div>
          ))}
          {quizzes.pagination && quizzes.pagination.pages > 1 ? (
            <div className="list-row pagination" aria-label="Quiz pages">
              <button
                className="secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span>
                Page {quizzes.pagination.page} of {quizzes.pagination.pages}
              </span>
              <button
                className="secondary"
                disabled={page >= quizzes.pagination.pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="empty-state">Choose a module to view quizzes.</p>
      )}
    </section>
  );
}

const gameIcons = {
  infected: '☣',
  island_escape: '⌁',
  memory_match: '▦',
  boss_battle: '◆',
  pixel_racer: '▰',
  timer_trivia: '◷',
};

function GameIcon({ gameKey, label }) {
  return (
    <svg
      className="game-icon"
      viewBox="0 0 80 80"
      role="img"
      aria-label={`${label} icon`}
    >
      <circle cx="40" cy="40" r="34" />
      <path d="M24 48 Q40 22 56 48 Q40 62 24 48Z" />
      <path d="M30 40h20M40 30v20" />
      <text x="40" y="45" textAnchor="middle">
        {gameIcons[gameKey] || '✦'}
      </text>
    </svg>
  );
}

export function GamesPage({ user, onStartGame }) {
  const catalogue = useData('/games/catalogue');
  const inProgress = useData('/games/in-progress');
  const [selectedKey, setSelectedKey] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const picker = useData(
    selectedKey
      ? `/games/quiz-picker?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`
      : '/games/quiz-picker?page=1&pageSize=20&search=',
  );
  const selected = catalogue.data.find((game) => game.key === selectedKey);
  const resumeFor = (key, quizId) =>
    inProgress.data.find(
      (play) => play.game_key === key && play.quiz_id === quizId,
    );
  return (
    <section className="games-page" aria-labelledby="games-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PRACTICE ARCADE</span>
          <h2 id="games-heading">Choose a game</h2>
          <p className="muted">
            {user.role === 'lecturer'
              ? 'Read-only preview of the games available in your modules.'
              : 'Pick a format, then choose a quiz from your enrolled modules.'}
          </p>
        </div>
      </div>
      {catalogue.loading && <p className="muted">Loading games…</p>}
      {catalogue.error && <p className="field-error">{catalogue.error}</p>}
      <div className="game-catalogue-grid">
        {catalogue.data.map((game) => {
          const resume = inProgress.data.find(
            (play) => play.game_key === game.key,
          );
          return (
            <article
              className={`card game-catalogue-card ${selectedKey === game.key ? 'selected' : ''}`}
              key={game.key}
            >
              <GameIcon gameKey={game.key} label={game.display_name} />
              <div className="game-card-heading">
                <h3>{game.display_name}</h3>
                {resume && <span className="resume-badge">Resume</span>}
              </div>
              <p>{game.description}</p>
              <div className="tag-row">
                <span>Solo</span>
                <span>Practice only</span>
                <span>Needs {game.minimum_questions} questions</span>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  setSelectedKey(game.key);
                  setPage(1);
                }}
              >
                Choose
              </button>
              {resume && user.role === 'student' && (
                <button
                  className="link-button"
                  onClick={() => onStartGame(game.key, resume.quiz_id)}
                >
                  Continue {resume.title}
                </button>
              )}
            </article>
          );
        })}
        <article
          className="card game-catalogue-card coming-soon"
          aria-label="Multiplayer games coming soon"
        >
          <GameIcon gameKey="multiplayer" label="Multiplayer" />
          <h3>Multiplayer rooms</h3>
          <p>Play together with a group in a shared room.</p>
          <div className="tag-row">
            <span>Coming soon</span>
          </div>
          <button className="secondary" disabled>
            Coming soon
          </button>
        </article>
      </div>
      {selected && (
        <section className="card game-picker" aria-labelledby="picker-heading">
          <div className="section-heading compact-heading">
            <div>
              <span className="eyebrow">
                {selected.display_name.toUpperCase()}
              </span>
              <h2 id="picker-heading">Choose a quiz</h2>
            </div>
            <button className="secondary" onClick={() => setSelectedKey('')}>
              Back to games
            </button>
          </div>
          <label htmlFor="game-quiz-search">Search quizzes</label>
          <input
            id="game-quiz-search"
            value={search}
            placeholder="Search by quiz title"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          {picker.loading && <p className="muted">Loading quizzes…</p>}
          {picker.error && <p className="field-error">{picker.error}</p>}
          {!picker.loading && !picker.error && !picker.data.length && (
            <p className="empty-state">No quizzes match your search.</p>
          )}
          <div className="quiz-picker-list">
            {picker.data.map((quiz) => {
              const game = quiz.games.find((item) => item.key === selectedKey);
              const resume = resumeFor(selectedKey, quiz.quiz_id);
              return (
                <article className="quiz-picker-row" key={quiz.quiz_id}>
                  <div>
                    <span className="eyebrow">{quiz.module_name}</span>
                    <h3>{quiz.title}</h3>
                    <p className="muted">
                      {quiz.is_competitive
                        ? 'Competitive · one scored attempt'
                        : 'Practice quiz'}
                    </p>
                  </div>
                  <div className="quiz-picker-status">
                    {resume && <span className="resume-badge">Resume</span>}
                    <span
                      className={
                        game?.available ? 'status-good' : 'status-warning'
                      }
                    >
                      {game?.available ? 'Available' : game?.reason}
                    </span>
                    {user.role === 'student' && game?.available && (
                      <button
                        className="primary"
                        onClick={() => onStartGame(selectedKey, quiz.quiz_id)}
                      >
                        {resume ? 'Continue' : 'Choose quiz'}
                      </button>
                    )}
                    {user.role === 'lecturer' && (
                      <span className="muted">Read-only preview</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {picker.pagination && picker.pagination.pages > 1 && (
            <div className="list-row pagination" aria-label="Game quiz pages">
              <button
                className="secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span>
                Page {picker.pagination.page} of {picker.pagination.pages}
              </span>
              <button
                className="secondary"
                disabled={page >= picker.pagination.pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
    </section>
  );
}

export function QuizGames({
  quizId,
  onPlayInfected,
  onPlayIslandEscape,
  onPlayMemoryMatch,
  onPlayBossBattle,
  onPlayPixelRacer,
  onPlayTimerTrivia,
}) {
  const games = useData(`/quizzes/${quizId}/games`);
  if (games.loading) return <p className="muted">Loading games…</p>;
  if (games.error) return <p className="field-error">{games.error}</p>;
  if (!games.data.length)
    return <p className="empty-state compact">Games coming soon.</p>;
  return (
    <section className="games-area" aria-label="Games">
      <h3>Games</h3>
      {games.data.map((game) => (
        <div className="game-entry" key={game.game_id}>
          <div>
            <b>{game.display_name}</b>
            {!game.available && <small>{game.reason}</small>}
          </div>
          {game.key === 'infected' && game.available && (
            <button className="primary" onClick={onPlayInfected}>
              Play Infected
            </button>
          )}
          {game.key === 'island_escape' && game.available && (
            <button className="primary" onClick={onPlayIslandEscape}>
              Play Island Escape
            </button>
          )}
          {game.key === 'memory_match' && game.available && (
            <button className="primary" onClick={onPlayMemoryMatch}>
              Play Memory Match
            </button>
          )}
          {game.key === 'boss_battle' && game.available && (
            <button className="primary" onClick={onPlayBossBattle}>
              Play Boss Battle
            </button>
          )}
          {game.key === 'pixel_racer' && game.available && (
            <button className="primary" onClick={onPlayPixelRacer}>
              Play Pixel Car Racer
            </button>
          )}
          {game.key === 'timer_trivia' && game.available && (
            <button className="primary" onClick={onPlayTimerTrivia}>
              Play Timer Trivia
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function BossCharacter({ hp }) {
  const damageState = hp > 75 ? 0 : hp > 50 ? 1 : hp > 25 ? 2 : 3;
  const labels = ['Unhurt', 'Bruised', 'Cracked', 'Critical'];
  return (
    <figure className={`boss-character damage-${damageState}`}>
      <svg
        viewBox="0 0 260 210"
        role="img"
        aria-label={`Boss condition: ${labels[damageState]}`}
      >
        <path
          className="boss-shadow"
          d="M52 188 Q130 215 208 188 Q170 169 130 174 Q90 169 52 188Z"
        />
        <path
          className="boss-horn"
          d="M72 68 Q31 28 51 92 L86 103ZM188 68 Q229 28 209 92 L174 103Z"
        />
        <path
          className="boss-body"
          d="M51 119 Q52 58 130 50 Q208 58 209 119 L195 179 Q130 202 65 179Z"
        />
        <path className="boss-brow" d="M78 103 L111 113 M182 103 L149 113" />
        <circle className="boss-eye" cx="96" cy="120" r="8" />
        <circle className="boss-eye" cx="164" cy="120" r="8" />
        <path className="boss-mouth" d="M99 157 Q130 135 161 157" />
        {damageState >= 1 && (
          <path className="boss-crack" d="M116 69 L106 89 L120 100 L110 120" />
        )}
        {damageState >= 2 && (
          <path
            className="boss-crack"
            d="M181 134 L164 143 L173 158 L153 174"
          />
        )}
        {damageState >= 3 && (
          <>
            <path className="boss-crack" d="M72 126 L90 139 L78 157 L99 177" />
            <path className="boss-bandage" d="M136 75 L166 88" />
          </>
        )}
      </svg>
      <figcaption>{labels[damageState]} boss</figcaption>
    </figure>
  );
}

export function BossBattleGame({ quizId, onBack }) {
  const [battle, setBattle] = useState(null);
  const [selected, setSelected] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setLoading(true);
    setError('');
    setFeedback(null);
    setSelected('');
    try {
      const body = await api('/games/boss-battle/plays', {
        method: 'POST',
        body: JSON.stringify({ quizId }),
      });
      setBattle(body.data);
    } catch (reason) {
      setBattle(null);
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quizId) start();
  }, [quizId]);

  const answer = async (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/boss-battle/plays/${battle.play.playId}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ optionId: selected }),
        },
      );
      setBattle({
        play: body.data.play,
        question: body.data.question,
        outcome: body.data.outcome,
      });
      setFeedback(body.data);
      setSelected('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Summoning the boss…</p>;
  if (error && !battle)
    return (
      <section className="card game-error">
        <p className="field-error" role="alert">
          {error}
        </p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );

  const terminal = battle.play.status !== 'in_progress';
  const terminalCopy = {
    won: ['Boss defeated', 'You brought the boss down.'],
    lost: ['The boss prevailed', 'Your team ran out of health.'],
    exhausted: [
      'Questions exhausted',
      'The battle ended before either side fell.',
    ],
  };

  return (
    <section className="boss-game">
      <div className="boss-topbar">
        <button className="link-button" onClick={onBack}>
          ← Back
        </button>
        <h2>BOSS BATTLE</h2>
        <span>Score {battle.play.score}</span>
      </div>
      <div className="boss-arena">
        <div className="boss-health" aria-label="Boss health">
          <div className="health-copy">
            <strong>Boss HP</strong>
            <span>{battle.play.bossHp}%</span>
          </div>
          <div
            className="health-track boss-hp-track"
            role="progressbar"
            aria-label="Boss HP"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={battle.play.bossHp}
          >
            <span style={{ width: `${battle.play.bossHp}%` }} />
          </div>
        </div>
        <BossCharacter hp={battle.play.bossHp} />
        <div className="player-health" aria-label="Player health">
          <div className="health-copy">
            <strong>Player HP</strong>
            <span>{battle.play.playerHp}%</span>
          </div>
          <div
            className="health-track player-hp-track"
            role="progressbar"
            aria-label="Player HP"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={battle.play.playerHp}
          >
            <span style={{ width: `${battle.play.playerHp}%` }} />
          </div>
        </div>
      </div>

      {feedback ? (
        <section
          className={`feedback-panel ${feedback.isCorrect ? 'correct' : 'incorrect'}`}
          aria-live="assertive"
          aria-atomic="true"
        >
          <h3>{feedback.isCorrect ? 'Correct' : 'Incorrect'}</h3>
          <p>
            {feedback.damageDealt > 0
              ? `Boss damage: ${feedback.damageDealt}.`
              : `Player damage: ${feedback.damageTaken}.`}
          </p>
          <p>
            Correct answer: <strong>{feedback.correctOption.optionText}</strong>
          </p>
          <p>{feedback.explanation}</p>
          <button className="primary" onClick={() => setFeedback(null)}>
            Continue
          </button>
        </section>
      ) : terminal ? (
        <section
          className={`terminal-screen ${battle.play.status}`}
          aria-live="polite"
        >
          <h3>{terminalCopy[battle.play.status][0]}</h3>
          <p>{terminalCopy[battle.play.status][1]}</p>
          <p>
            Final score {battle.play.score} · Boss HP {battle.play.bossHp}% ·
            Player HP {battle.play.playerHp}%
          </p>
          <div className="terminal-actions">
            <button className="primary" onClick={start}>
              Play again
            </button>
            <button className="secondary" onClick={onBack}>
              Back to quiz
            </button>
          </div>
        </section>
      ) : (
        <form className="boss-question" onSubmit={answer}>
          <span className={`difficulty ${battle.question.difficulty}`}>
            {battle.question.difficulty} · Level{' '}
            {battle.question.difficultyLevel}
          </span>
          <p className="eyebrow">{battle.question.topic}</p>
          <h3>{battle.question.questionText}</h3>
          <div className="option-list">
            {battle.question.options.map((option) => (
              <label key={option.optionId}>
                <input
                  type="radio"
                  name="boss-option"
                  value={option.optionId}
                  checked={selected === option.optionId}
                  onChange={() => setSelected(option.optionId)}
                />
                {option.optionText}
              </label>
            ))}
          </div>
          <button className="primary" disabled={!selected || busy}>
            {busy ? 'Applying answer…' : 'Submit answer'}
          </button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

function PixelCar({ label, distance, player = false }) {
  const lanePosition = Math.min(92, Math.max(4, (distance / 500) * 88));
  return (
    <div className="pixel-lane" aria-label={`${label}: ${distance} distance`}>
      <span className="pixel-lane-label">{label}</span>
      <span
        className={`pixel-car ${player ? 'player-car' : 'bot-car'}`}
        style={{ left: `${lanePosition}%` }}
        role="img"
        aria-label={`${label} car at ${distance}`}
      >
        <i />
        <b />
        <em />
      </span>
      <span className="finish-line" aria-hidden="true" />
    </div>
  );
}

export function PixelRacerGame({ quizId, onBack }) {
  const [race, setRace] = useState(null);
  const [selected, setSelected] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setLoading(true);
    setError('');
    setFeedback(null);
    setSelected('');
    try {
      const body = await api('/games/pixel-racer/plays', {
        method: 'POST',
        body: JSON.stringify({ quizId }),
      });
      setRace(body.data);
    } catch (reason) {
      setRace(null);
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quizId) start();
  }, [quizId]);

  const answer = async (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/pixel-racer/plays/${race.play.playId}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ optionId: selected }),
        },
      );
      setRace({
        play: body.data.play,
        question: body.data.question,
        outcome: body.data.outcome,
      });
      setFeedback(body.data);
      setSelected('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Starting the engines…</p>;
  if (error && !race)
    return (
      <section className="card game-error">
        <p className="field-error" role="alert">
          {error}
        </p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );

  const terminal = race.play.status === 'finished';
  const resultTitle =
    race.outcome?.winner === 'player'
      ? 'You won the race!'
      : race.outcome?.winner === 'bot'
        ? 'Bot wins this race'
        : 'Photo finish — shared result';

  return (
    <section className="pixel-racer-game">
      <div className="pixel-racer-topbar">
        <button className="link-button" onClick={onBack}>
          ← Back
        </button>
        <h2>PIXEL CAR RACER</h2>
        <span>Points {race.play.points}</span>
      </div>

      <div className="pixel-track" aria-label="Race positions">
        <PixelCar label="You" distance={race.play.distance} player={true} />
        <PixelCar label="Bot" distance={race.play.bot.distance} />
      </div>

      <div className="pixel-racer-stats" aria-label="Race statistics">
        <span>Speed {race.play.speed} of 5</span>
        <span>Streak {race.play.streak}</span>
        <span>
          Question slots {race.play.slotsUsed} of 10 · Answers{' '}
          {race.play.answersUsed}
        </span>
        <strong className={race.play.nitroActive ? 'nitro-active' : ''}>
          {race.play.nitroActive
            ? 'NITRO ACTIVE, answers worth double'
            : 'Nitro inactive'}
        </strong>
      </div>

      {feedback ? (
        <section
          className={`feedback-panel ${feedback.isCorrect ? 'correct' : 'incorrect'}`}
          aria-live="assertive"
          aria-atomic="true"
        >
          <h3>{feedback.isCorrect ? 'Correct' : 'Incorrect'}</h3>
          <p>
            Distance gained: {feedback.distanceGained} · Points earned:{' '}
            {feedback.pointsEarned} · Slots used: {feedback.slotsConsumed}
          </p>
          <p>
            Correct answer: <strong>{feedback.correctOption.optionText}</strong>
          </p>
          <p>{feedback.explanation}</p>
          <button className="primary" onClick={() => setFeedback(null)}>
            Continue
          </button>
        </section>
      ) : terminal ? (
        <section className="pixel-racer-result" aria-live="polite">
          <div className="pixel-trophy" aria-hidden="true">
            ★
          </div>
          <h3>{resultTitle}</h3>
          <p>
            You: {race.outcome.playerDistance} distance ·{' '}
            {race.outcome.playerPoints} points
          </p>
          <p>
            Bot: {race.outcome.botDistance} distance · {race.outcome.botPoints}{' '}
            points
          </p>
          <p>Answers used: {race.outcome.answersUsed}</p>
          <div className="terminal-actions">
            <button className="primary" onClick={start}>
              Race again
            </button>
            <button className="secondary" onClick={onBack}>
              Back to quiz
            </button>
          </div>
        </section>
      ) : (
        <form className="pixel-racer-question" onSubmit={answer}>
          <p className="eyebrow">{race.question.topic}</p>
          <h3>{race.question.questionText}</h3>
          <div className="option-list">
            {race.question.options.map((option) => (
              <label key={option.optionId}>
                <input
                  type="radio"
                  name="pixel-option"
                  value={option.optionId}
                  checked={selected === option.optionId}
                  onChange={() => setSelected(option.optionId)}
                />
                {option.optionText}
              </label>
            ))}
          </div>
          <button className="primary" disabled={!selected || busy}>
            {busy ? 'Racing…' : 'Submit answer'}
          </button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

export function TimerTriviaGame({ quizId, onBack }) {
  const [play, setPlay] = useState(null);
  const [selected, setSelected] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [countdownAnnouncement, setCountdownAnnouncement] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previousRemainingRef = useRef(null);

  const start = async () => {
    setLoading(true);
    setError('');
    setFeedback(null);
    setSelected('');
    try {
      const body = await api('/games/timer-trivia/plays', {
        method: 'POST',
        body: JSON.stringify({ quizId }),
      });
      setPlay(body.data);
    } catch (reason) {
      setPlay(null);
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (quizId) start();
  }, [quizId]);
  useEffect(() => {
    const deadlineAt = play?.play.deadlineAt;
    const playId = play?.play.playId;
    if (!deadlineAt || !playId) {
      previousRemainingRef.current = null;
      setCountdownAnnouncement('');
      return undefined;
    }
    const storageKey = `eduquest:timer-trivia:announcements:${playId}:${deadlineAt}`;
    let seen = new Set();
    try {
      seen = new Set(
        JSON.parse(window.localStorage.getItem(storageKey) || '[]'),
      );
    } catch {
      seen = new Set();
    }
    const persist = () => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...seen]));
      } catch {
        // Announcement persistence is best effort when storage is unavailable.
      }
    };
    const update = () => {
      const remainingMs = Date.parse(deadlineAt) - Date.now();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      const previousRemaining = previousRemainingRef.current;
      setSeconds(remainingSeconds);
      for (const threshold of [10, 5]) {
        if (
          remainingMs >= 0 &&
          previousRemaining !== null &&
          previousRemaining > threshold * 1000 &&
          remainingMs <= threshold * 1000 &&
          !seen.has(threshold)
        ) {
          seen.add(threshold);
          persist();
          setCountdownAnnouncement(`${threshold} seconds remaining`);
        } else if (remainingMs < threshold * 1000 && !seen.has(threshold)) {
          seen.add(threshold);
          persist();
        }
      }
      previousRemainingRef.current = remainingMs;
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [play?.play.deadlineAt]);

  const choose = async (cell) => {
    if (busy || cell.disabled || play.play.activeCellId) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/timer-trivia/plays/${play.play.playId}/choose`,
        { method: 'POST', body: JSON.stringify({ cellId: cell.cellId }) },
      );
      setPlay(body.data);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  const answer = async (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/timer-trivia/plays/${play.play.playId}/answer`,
        { method: 'POST', body: JSON.stringify({ optionId: selected }) },
      );
      setPlay(body.data);
      setFeedback(body.data);
      setSelected('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Loading the trivia board…</p>;
  if (error && !play)
    return (
      <section className="card game-error">
        <p className="field-error" role="alert">
          {error}
        </p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );
  const terminal = play.play.status === 'finished';
  return (
    <section className="timer-trivia-game">
      <div className="timer-trivia-topbar">
        <button className="link-button" onClick={onBack}>
          ← Back
        </button>
        <h2>TIMER TRIVIA</h2>
        <span>Score {play.play.score}</span>
      </div>
      <div className="timer-trivia-meta" aria-label="Trivia status">
        <span>Round {play.play.roundsCompleted + 1} of 10</span>
        {play.play.deadlineAt && <strong>Time remaining: {seconds}s</strong>}
        {play.play.extendedTime && <span>Extended time enabled</span>}
      </div>
      <p
        className="timer-trivia-announcement"
        aria-live="polite"
        aria-atomic="true"
      >
        {countdownAnnouncement}
      </p>
      {feedback ? (
        <section
          className={`feedback-panel ${feedback.isCorrect ? 'correct' : 'incorrect'}`}
          aria-live="assertive"
        >
          <h3>
            {feedback.timedOut
              ? 'Time is up'
              : feedback.isCorrect
                ? 'Correct'
                : 'Incorrect'}
          </h3>
          <p>Points earned: {feedback.pointsEarned}</p>
          <p>
            Correct answer: <strong>{feedback.correctOption.optionText}</strong>
          </p>
          <p>{feedback.explanation}</p>
          <button className="primary" onClick={() => setFeedback(null)}>
            Continue
          </button>
        </section>
      ) : terminal ? (
        <section className="timer-trivia-result" aria-live="polite">
          <div className="trivia-trophy" aria-hidden="true">
            ✦
          </div>
          <h3>Board complete</h3>
          <p>
            Final score: {play.play.score} points across{' '}
            {play.play.roundsCompleted} rounds.
          </p>
          <div className="terminal-actions">
            <button className="primary" onClick={start}>
              Play again
            </button>
            <button className="secondary" onClick={onBack}>
              Back to quiz
            </button>
          </div>
        </section>
      ) : play.question ? (
        <form className="timer-trivia-question" onSubmit={answer}>
          <p className="eyebrow">
            {play.question.topic} · Level {play.question.difficultyLevel}
          </p>
          <h3>{play.question.questionText}</h3>
          <div className="option-list">
            {play.question.options.map((option) => (
              <label key={option.optionId}>
                <input
                  type="radio"
                  name="timer-option"
                  value={option.optionId}
                  checked={selected === option.optionId}
                  onChange={() => setSelected(option.optionId)}
                />
                {option.optionText}
              </label>
            ))}
          </div>
          <button className="primary" disabled={!selected || busy}>
            {busy ? 'Checking…' : 'Submit answer'}
          </button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <section className="timer-board" aria-label="Timer Trivia board">
          <p className="muted">
            Choose an open topic and point value. Each cell can be used once.
          </p>
          <div className="trivia-board">
            {play.play.board.map((cell) => (
              <button
                key={cell.cellId}
                className={`trivia-cell ${cell.disabled ? 'disabled' : ''}`}
                disabled={cell.disabled || busy}
                onClick={() => choose(cell)}
                aria-label={`${cell.topic}, ${cell.points} points${cell.disabled ? ', used' : ''}`}
              >
                <span>{cell.topic}</span>
                <strong>{cell.points}</strong>
              </button>
            ))}
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </section>
  );
}

export function MemoryMatchGame({ quizId, onBack }) {
  const [play, setPlay] = useState(null);
  const [hiddenMismatch, setHiddenMismatch] = useState(() => new Set());
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mismatchTimer = useRef(null);

  const start = async () => {
    if (mismatchTimer.current) clearTimeout(mismatchTimer.current);
    setLoading(true);
    setError('');
    setAnnouncement('');
    setHiddenMismatch(new Set());
    try {
      const body = await api('/games/memory-match/plays', {
        method: 'POST',
        body: JSON.stringify({ quizId }),
      });
      setPlay(body.data);
    } catch (reason) {
      setPlay(null);
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quizId) start();
    return () => {
      if (mismatchTimer.current) clearTimeout(mismatchTimer.current);
    };
  }, [quizId]);

  const flip = async (card) => {
    if (busy || card.matched) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(`/games/memory-match/plays/${play.playId}/flip`, {
        method: 'POST',
        body: JSON.stringify({ cardId: card.cardId }),
      });
      const next = body.data;
      setHiddenMismatch(new Set());
      setPlay(next);
      if (next.status === 'finished') {
        setAnnouncement(
          `All pairs matched. Final score ${next.score} in ${next.moves} moves.`,
        );
        setBusy(false);
      } else if (next.matched === true) {
        setAnnouncement(
          `Match found. ${next.matchedPairs} pairs found. Score ${next.score}.`,
        );
        setBusy(false);
      } else if (next.matched === false) {
        setAnnouncement('Not a match. The cards will turn face down.');
        const mismatchIds = next.cards
          .filter((item) => item.faceUp && !item.matched)
          .map((item) => item.cardId);
        const reducedMotion =
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
          false;
        mismatchTimer.current = setTimeout(
          () => {
            setHiddenMismatch(new Set(mismatchIds));
            setBusy(false);
          },
          reducedMotion ? 0 : 1000,
        );
      } else {
        setAnnouncement(`${card.kind} card revealed.`);
        setBusy(false);
      }
    } catch (reason) {
      setError(reason.message);
      setBusy(false);
    }
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Shuffling the cards…</p>;
  if (error && !play)
    return (
      <section className="card game-error">
        <p className="field-error" role="alert">
          {error}
        </p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );

  const revealed = new Map(
    (play.revealed || []).map((card) => [card.cardId, card]),
  );
  if (play.status === 'finished')
    return (
      <section className="memory-game">
        <div className="memory-topbar">
          <button className="link-button" onClick={onBack}>
            ← Back
          </button>
          <h2>MEMORY MATCH</h2>
          <span>Complete</span>
        </div>
        <div className="memory-finished" aria-live="polite">
          <span className="memory-finished-mark" aria-hidden="true">
            ✓
          </span>
          <h3>Every pair matched</h3>
          <p>
            Final score {play.score} · {play.moves} moves · {play.matchedPairs}{' '}
            pairs found
          </p>
          <div className="terminal-actions">
            <button className="primary" onClick={start}>
              Play again
            </button>
            <button className="secondary" onClick={onBack}>
              Back to quiz
            </button>
          </div>
        </div>
      </section>
    );

  return (
    <section className="memory-game">
      <div className="memory-topbar">
        <button className="link-button" onClick={onBack}>
          ← Back
        </button>
        <h2>MEMORY MATCH</h2>
        <div className="memory-stats" aria-label="Game statistics">
          <span>Score {play.score}</span>
          <span>Moves {play.moves}</span>
          <span>Pairs found {play.matchedPairs}</span>
        </div>
      </div>
      <p className="memory-instructions">
        Match each question card with its correct answer card.
      </p>
      <div className="memory-grid" aria-label="Memory Match cards">
        {play.cards.map((card, index) => {
          const visible =
            (card.faceUp || card.matched) && !hiddenMismatch.has(card.cardId);
          const content = revealed.get(card.cardId);
          return (
            <button
              type="button"
              key={card.cardId}
              className={`memory-card memory-${card.kind} ${visible ? 'is-face-up' : ''} ${card.matched ? 'is-matched' : ''}`}
              disabled={busy || card.matched || (visible && !card.matched)}
              onClick={() => flip(card)}
              aria-label={
                card.matched
                  ? `Matched ${card.kind} card ${index + 1}: ${content?.text}`
                  : visible
                    ? `Face-up ${card.kind} card ${index + 1}: ${content?.text}`
                    : `Flip ${card.kind} card ${index + 1}`
              }
            >
              <span className="memory-card-inner">
                <span className="memory-card-back" aria-hidden={visible}>
                  <span className="memory-card-symbol">
                    {card.kind === 'question' ? '?' : 'A'}
                  </span>
                  <small>
                    {card.kind === 'question' ? 'Question' : 'Answer'}
                  </small>
                </span>
                {visible && content && (
                  <span className="memory-card-front">
                    <small>
                      {card.kind === 'question' ? 'Question' : 'Answer'}
                    </small>
                    <b>{content.text}</b>
                    {card.matched && <em>Matched</em>}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </p>
      {error && (
        <p className="field-error memory-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

const difficultyMeta = {
  easy: { icon: '●', label: 'Easy' },
  medium: { icon: '◆', label: 'Medium' },
  hard: { icon: '▲', label: 'Hard' },
};

function InfectedCharacter({ cure }) {
  const band = Math.min(4, Math.floor(cure / 20));
  const colours = ['#B3261E', '#C77700', '#F2A93B', '#688A62', '#2F8F5B'];
  const expressions = [
    'M34 66 Q50 52 66 66',
    'M34 64 Q50 56 66 64',
    'M34 62 L66 62',
    'M34 60 Q50 70 66 60',
    'M32 58 Q50 75 68 58',
  ];
  return (
    <svg
      className="infected-character"
      viewBox="0 0 100 120"
      role="img"
      aria-label={`Character health state ${band + 1} of 5`}
    >
      <circle cx="50" cy="50" r="38" fill={colours[band]} opacity="0.18" />
      <path
        d="M28 44 Q50 10 72 44 L68 84 Q50 103 32 84 Z"
        fill={colours[band]}
      />
      <circle cx="40" cy="50" r="4" fill="#14213D" />
      <circle cx="60" cy="50" r="4" fill="#14213D" />
      <path
        d={expressions[band]}
        fill="none"
        stroke="#14213D"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M31 34 L23 23 M69 34 L77 23"
        stroke={colours[band]}
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function InfectedGame({ quizId, onBack }) {
  const [state, setState] = useState(null);
  const [selectedOption, setSelectedOption] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setLoading(true);
    setError('');
    setFeedback(null);
    setSelectedOption('');
    try {
      setState(
        await api('/games/infected/sessions', {
          method: 'POST',
          body: JSON.stringify({ quizId }),
        }),
      );
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quizId) start();
  }, [quizId]);

  const choose = async (cardId) => {
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/infected/sessions/${state.session.sessionId}/choose`,
        { method: 'POST', body: JSON.stringify({ cardId }) },
      );
      setState((current) => ({ ...current, question: body.question }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const answer = async () => {
    if (!selectedOption) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/infected/sessions/${state.session.sessionId}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ optionId: selectedOption }),
        },
      );
      setFeedback(body);
      setState((current) => ({ ...current, session: body.session }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const continueGame = () => {
    setState((current) => ({
      ...current,
      cards: feedback.cards,
      question: null,
    }));
    setFeedback(null);
    setSelectedOption('');
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Preparing Infected…</p>;
  if (error && !state)
    return (
      <section className="card game-error">
        <p className="field-error">{error}</p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );
  const session = feedback?.session || state.session;
  const terminal = ['won', 'lost', 'exhausted'].includes(session.status);
  return (
    <section className="infected-game">
      <div className="infected-topbar">
        <button
          className="link-button"
          onClick={onBack}
          aria-label="Back to quiz"
        >
          ← Back
        </button>
        <h2>INFECTED</h2>
        <div className="game-stats">
          <span aria-label={`${session.hearts} of 3 hearts`}>
            {'♥'.repeat(session.hearts)}
            {'♡'.repeat(3 - session.hearts)} {session.hearts} of 3 hearts
          </span>
          <b>Score {session.score}</b>
        </div>
      </div>
      <div className="infected-stage">
        <InfectedCharacter cure={session.cure} />
        <div className="cure-copy">
          Cure {session.cure}% · Infection {100 - session.cure}%
        </div>
        <div
          className="cure-track"
          role="progressbar"
          aria-label="Cure progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={session.cure}
        >
          <span style={{ width: `${session.cure}%` }} />
        </div>
      </div>

      {terminal ? (
        <div className={`terminal-screen ${session.status}`} aria-live="polite">
          <h3>
            {session.status === 'won'
              ? 'Cure complete — you win!'
              : session.status === 'lost'
                ? 'No hearts left'
                : 'Questions exhausted'}
          </h3>
          <p>
            Final cure: {session.cure}% · Final score: {session.score}
          </p>
          <div className="terminal-actions">
            <button className="primary" onClick={start}>
              Play again
            </button>
            <button className="secondary" onClick={onBack}>
              Back to quiz
            </button>
          </div>
        </div>
      ) : feedback ? (
        <div
          className={`feedback-panel ${feedback.isCorrect ? 'correct' : 'incorrect'}`}
          aria-live="assertive"
        >
          <h3>{feedback.isCorrect ? 'Correct' : 'Incorrect'}</h3>
          <p>
            <b>Correct answer:</b> {feedback.correctOption.optionText}
          </p>
          <p>{feedback.explanation}</p>
          <button className="primary" onClick={continueGame}>
            Continue
          </button>
        </div>
      ) : state.question ? (
        <div className="infected-question">
          <span className={`difficulty ${state.question.difficulty}`}>
            {difficultyMeta[state.question.difficulty].icon}{' '}
            {difficultyMeta[state.question.difficulty].label}
          </span>
          <h3>{state.question.questionText}</h3>
          <fieldset>
            <legend>Choose one answer</legend>
            {state.question.options.map((option) => (
              <label key={option.optionId}>
                <input
                  type="radio"
                  name="infected-answer"
                  value={option.optionId}
                  checked={selectedOption === option.optionId}
                  onChange={() => setSelectedOption(option.optionId)}
                />
                {option.optionText}
              </label>
            ))}
          </fieldset>
          <button
            className="primary"
            disabled={!selectedOption || busy}
            onClick={answer}
          >
            Submit answer
          </button>
        </div>
      ) : state.cards?.length ? (
        <div className="infected-cards" aria-label="Choose a question card">
          {state.cards.map((card) => (
            <button
              key={card.cardId}
              className={`infected-card ${card.difficulty}`}
              disabled={busy}
              onClick={() => choose(card.cardId)}
              aria-label={`${card.difficulty} card about ${card.topic}, plus ${card.reward} or minus ${card.penalty}`}
            >
              <span className="card-icon" aria-hidden="true">
                {difficultyMeta[card.difficulty].icon}
              </span>
              <b>{difficultyMeta[card.difficulty].label}</b>
              <span>{card.topic}</span>
              <strong>
                +{card.reward} / −{card.penalty}
              </strong>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty-state">No cards are available.</p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

const islandSetbacks = {
  tools_lost: {
    title: 'Your tools were lost',
    text: 'Phase 1 restarts and the materials from this attempt are gone.',
  },
  boat_broken: {
    title: 'The boat broke',
    text: 'Phase 2 restarts. Your gathered materials are safe.',
  },
  sharks: {
    title: 'Sharks damaged the boat',
    text: 'Return to Phase 2 and rebuild. Your Phase 1 materials are safe.',
  },
};

function IslandScene({ play }) {
  const progress =
    play.phase === 1
      ? play.materials.length
      : play.phase === 2
        ? play.boatParts.length
        : play.sailProgress;
  const boatX = 82 + Math.min(10, progress) * 14;
  return (
    <svg
      className="island-scene"
      viewBox="0 0 260 150"
      role="img"
      aria-label={`${play.phaseName}; ${progress} progress items collected`}
    >
      <rect width="260" height="150" rx="18" fill="#dcecf4" />
      <circle cx="218" cy="30" r="15" fill="#f2a93b" />
      <path d="M0 105 Q65 88 130 105 T260 105 V150 H0Z" fill="#4d91b8" />
      <path d="M0 112 Q48 87 92 110 L74 128 H0Z" fill="#d8bd72" />
      <path d="M26 104 Q40 62 48 36" stroke="#795b38" strokeWidth="6" />
      <path d="M47 39 Q17 29 12 49 Q35 48 47 39" fill="#2f8f5b" />
      <path d="M47 39 Q76 22 87 42 Q62 48 47 39" fill="#2f8f5b" />
      {play.phase >= 2 && (
        <g transform={`translate(${boatX} 84)`}>
          <path d="M0 30 L50 30 L41 45 L10 45Z" fill="#9b633d" />
          <path d="M25 30 V0" stroke="#5f402a" strokeWidth="4" />
          <path d="M28 2 L28 25 L49 25Z" fill="#f6f4ef" />
        </g>
      )}
      <path d="M226 92 Q242 70 258 92 V112 H226Z" fill="#7ea36f" />
      <text x="205" y="130" fill="#14213d" fontSize="10">
        MAINLAND
      </text>
    </svg>
  );
}

export function IslandEscapeGame({ quizId, onBack }) {
  const [state, setState] = useState(null);
  const [selectedOption, setSelectedOption] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setLoading(true);
    setError('');
    setFeedback(null);
    setSelectedOption('');
    try {
      setState(
        await api('/games/island-escape/plays', {
          method: 'POST',
          body: JSON.stringify({ quizId }),
        }),
      );
    } catch (reason) {
      setError(reason.message);
      setState(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quizId) start();
  }, [quizId]);

  const answer = async () => {
    if (!selectedOption || busy) return;
    setBusy(true);
    setError('');
    try {
      setFeedback(
        await api(`/games/island-escape/plays/${state.play.playId}/answer`, {
          method: 'POST',
          body: JSON.stringify({ optionId: selectedOption }),
        }),
      );
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const continueGame = () => {
    setState({
      play: feedback.play,
      question: feedback.question,
      personalBest: feedback.personalBest,
    });
    setFeedback(null);
    setSelectedOption('');
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Preparing your escape…</p>;
  if (!state)
    return (
      <section className="card game-error">
        <p className="field-error">{error}</p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );

  const play = feedback?.play || state.play;
  const terminal = ['won', 'lost', 'exhausted'].includes(play.status);
  const setback = feedback && islandSetbacks[feedback.event];
  return (
    <section className="island-game">
      <div className="island-topbar">
        <button className="link-button" onClick={onBack}>
          ← Back to quiz
        </button>
        <div>
          <span className="eyebrow">SOLO ADVENTURE</span>
          <h2>Island Escape</h2>
        </div>
        <b>Score {play.score}</b>
      </div>

      <div className="island-layout">
        <div className="island-visual">
          <IslandScene play={play} />
          <div className="phase-strip" aria-label="Escape phases">
            {[1, 2, 3].map((phase) => (
              <span
                key={phase}
                className={phase === play.phase ? 'active' : ''}
                aria-current={phase === play.phase ? 'step' : undefined}
              >
                {phase}. {['Gather', 'Build', 'Sail'][phase - 1]}
              </span>
            ))}
          </div>
          <p className="phase-copy">
            Phase {play.phase} of 3 · Question{' '}
            {Math.min(10, play.phaseQuestionNumber + 1)} of 10
          </p>
          <div className="island-stats">
            <span>
              Wrong answers {play.wrongInPhase} of 5{' '}
              <span aria-hidden="true">
                {'●'.repeat(play.wrongInPhase)}
                {'○'.repeat(5 - play.wrongInPhase)}
              </span>
            </span>
            <span>Streak {play.streak}</span>
            <span>Retries remaining {play.retriesRemaining}</span>
          </div>
          {play.doubleActive && (
            <strong className="double-active">DOUBLE POINTS ACTIVE</strong>
          )}
          <div className="island-inventory">
            <span>Materials: {play.materials.join(', ') || 'None yet'}</span>
            <span>Boat parts: {play.boatParts.join(', ') || 'None yet'}</span>
            <span>Sailing progress: {play.sailProgress} steps</span>
          </div>
        </div>

        {feedback ? (
          <div
            className={`feedback-panel ${feedback.isCorrect ? 'correct' : 'incorrect'}`}
            aria-live="assertive"
          >
            <h3>{feedback.isCorrect ? 'Correct' : 'Incorrect'}</h3>
            <p>
              <b>Correct answer:</b> {feedback.correctOption.optionText}
            </p>
            <p>{feedback.explanation}</p>
            <p>
              Points earned: {feedback.pointsEarned}. Score: {play.score}.
            </p>
            {setback && (
              <div className="setback-callout">
                <h3>{setback.title}</h3>
                <p>{setback.text}</p>
                <p>{play.retriesRemaining} retries remain.</p>
              </div>
            )}
            <button className="primary" onClick={continueGame}>
              Continue
            </button>
          </div>
        ) : terminal ? (
          <div className={`terminal-screen ${play.status}`} aria-live="polite">
            <h3>
              {play.status === 'won'
                ? 'You reached the mainland'
                : play.status === 'lost'
                  ? 'Stranded'
                  : 'No more questions are available'}
            </h3>
            <p>
              Final score: {play.score} · Personal best:{' '}
              {state.personalBest ?? play.score}
            </p>
            <div className="terminal-actions">
              <button className="primary" onClick={start}>
                Play again
              </button>
              <button className="secondary" onClick={onBack}>
                Back to quiz
              </button>
            </div>
          </div>
        ) : state.question ? (
          <div className="island-question">
            <span className={`difficulty ${state.question.difficulty}`}>
              Level {state.question.difficultyLevel} ·{' '}
              {state.question.difficulty}
            </span>
            <small>{state.question.topic}</small>
            <h3>{state.question.questionText}</h3>
            <fieldset>
              <legend>Choose one answer</legend>
              {state.question.options.map((option) => (
                <label key={option.optionId}>
                  <input
                    type="radio"
                    name="island-answer"
                    checked={selectedOption === option.optionId}
                    onChange={() => setSelectedOption(option.optionId)}
                  />
                  {option.optionText}
                </label>
              ))}
            </fieldset>
            <button
              className="primary"
              disabled={!selectedOption || busy}
              onClick={answer}
            >
              Submit answer
            </button>
          </div>
        ) : (
          <p className="empty-state">No Island Escape question is ready.</p>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function QuizTaking({ quizId }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    attempt: null,
    quiz: null,
    questions: [],
  });
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!quizId) return;
    api(`/quizzes/${quizId}/attempts`, { method: 'POST' })
      .then((body) => setState({ loading: false, error: '', ...body }))
      .catch((reason) =>
        setState((current) => ({
          ...current,
          loading: false,
          error: reason.message,
        })),
      );
  }, [quizId]);
  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (state.loading) return <p className="muted">Loading quiz…</p>;
  if (state.error) return <p className="field-error">{state.error}</p>;
  if (result)
    return (
      <section className="card">
        <h2>Result</h2>
        <p>Your score: {result.result.score}</p>
        <p>{result.unansweredCount} unanswered.</p>
      </section>
    );
  const submit = async () => {
    const unanswered = state.questions.length - Object.keys(answers).length;
    if (
      unanswered &&
      !window.confirm(
        `${unanswered} question(s) are unanswered. Submit anyway?`,
      )
    )
      return;
    setSubmitting(true);
    try {
      setResult(
        await api(`/attempts/${state.attempt.attempt_id}/submit`, {
          method: 'POST',
          body: JSON.stringify({
            answers: Object.entries(answers).map(([questionId, optionId]) => ({
              questionId,
              optionId,
            })),
          }),
        }),
      );
    } catch (reason) {
      setState((current) => ({ ...current, error: reason.message }));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section className="card">
      {state.quiz.is_competitive && (
        <div className="warning">One scored attempt only.</div>
      )}
      <h2>{state.quiz.title}</h2>
      {state.questions.map((question) => (
        <fieldset key={question.question_id}>
          <legend>{question.question_text}</legend>
          {question.options.map((option) => (
            <label key={option.optionId}>
              <input
                type="radio"
                name={question.question_id}
                checked={answers[question.question_id] === option.optionId}
                onChange={() =>
                  setAnswers({
                    ...answers,
                    [question.question_id]: option.optionId,
                  })
                }
              />
              {option.optionText}
            </label>
          ))}
        </fieldset>
      ))}
      {state.error && <p className="field-error">{state.error}</p>}
      <button className="primary" disabled={submitting} onClick={submit}>
        {submitting ? 'Submitting…' : 'Submit attempt'}
      </button>
    </section>
  );
}

if (document.getElementById('root'))
  createRoot(document.getElementById('root')).render(<App />);
