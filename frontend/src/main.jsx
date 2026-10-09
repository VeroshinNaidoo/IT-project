import React, { useEffect, useState } from 'react';
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
      <form className="card auth-card" onSubmit={submit}>
        <span className="eyebrow">EDUQUEST</span>
        <h1>
          {mode === 'login' ? 'Welcome back' : 'Create your student account'}
        </h1>
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
  ];
  const lecturerScreens = ['Modules', 'Resources', 'Quizzes', 'Analytics'];
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
        {screen === 'Quizzes' && (
          <Quizzes
            onTake={(id) => {
              setQuizId(id);
              setScreen('Quiz');
            }}
          />
        )}
        {screen === 'Quiz' && <QuizTaking quizId={quizId} />}
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
        <h2>Keep your work moving.</h2>
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
function Modules({ user }) {
  const state = useData('/modules');
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState('');
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
        {state.data.map((module) => (
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
          <ul>
            {quiz.questions?.map((question) => (
              <li key={question.questionId}>
                {question.questionText}{' '}
                <small>{question.topic || 'No topic'}</small>
              </li>
            ))}
          </ul>
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
function Quizzes({ onTake }) {
  const modules = useData('/modules');
  const [moduleId, setModuleId] = useState('');
  const quizzes = useData(
    moduleId ? `/modules/${moduleId}/quizzes` : '/modules',
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
          <State state={quizzes} empty="No published quizzes yet." />
          {quizzes.data.map((quiz) => (
            <div className="list-row" key={quiz.quiz_id}>
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
          ))}
        </>
      ) : (
        <p className="empty-state">Choose a module to view quizzes.</p>
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
