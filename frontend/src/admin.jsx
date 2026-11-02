import React, { useEffect, useState } from 'react';

/** Read-only summaries and audited platform controls for administrators. */

const adminApi = async (path, options = {}) => {
  const response = await fetch(`/api/v1/admin${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message || 'The admin request failed.');
  return body;
};

const tabs = ['Overview', 'Users', 'Modules', 'Moderation', 'System', 'Audit'];

function Metric({ label, value }) {
  return (
    <article className="card admin-metric">
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </article>
  );
}

export function AdminPage() {
  const [tab, setTab] = useState('Overview');
  const [state, setState] = useState({
    loading: true,
    error: '',
    data: null,
    endpoint: null,
  });
  const [refresh, setRefresh] = useState(0);
  const endpoint = {
    Overview: '/dashboard',
    Users: '/users',
    Modules: '/modules',
    Moderation: '/reports',
    System: '/system',
    Audit: '/audit',
  }[tab];
  useEffect(() => {
    let active = true;
    setState({ loading: true, error: '', data: null, endpoint });
    adminApi(endpoint)
      .then(
        (data) =>
          active && setState({ loading: false, error: '', data, endpoint }),
      )
      .catch(
        (cause) =>
          active &&
          setState({
            loading: false,
            error: cause.message,
            data: null,
            endpoint,
          }),
      );
    return () => {
      active = false;
    };
  }, [endpoint, refresh]);
  const act = async (path, body) => {
    try {
      await adminApi(path, { method: 'PATCH', body: JSON.stringify(body) });
      setRefresh((value) => value + 1);
    } catch (cause) {
      setState((current) => ({ ...current, error: cause.message }));
    }
  };
  // A tab may render once before its effect runs. Never render the new tab with
  // the previous endpoint's differently shaped response.
  const ready =
    !state.loading && !state.error && state.endpoint === endpoint && state.data;
  return (
    <section className="admin-page" aria-labelledby="admin-heading">
      {/* Admin scope is platform safety and access—not academic score editing. */}
      <div className="section-heading">
        <div>
          <span className="eyebrow">PLATFORM ADMINISTRATION</span>
          <h2 id="admin-heading">Admin control centre</h2>
          <p className="muted">
            Manage platform access and health. Academic scores and private
            credentials are never editable here.
          </p>
        </div>
      </div>
      {/* Operational areas share the same audited, administrator-only API. */}
      <nav className="admin-tabs" aria-label="Administration sections">
        {tabs.map((item) => (
          <button
            key={item}
            className={tab === item ? 'active' : ''}
            aria-current={tab === item ? 'page' : undefined}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {(state.loading || state.endpoint !== endpoint) && (
        <p className="muted">Loading administration data…</p>
      )}
      {state.endpoint === endpoint && state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      {ready && tab === 'Overview' && (
        /* Aggregate operational metrics contain no private student work. */
        <div className="admin-metrics">
          <Metric label="Students" value={state.data.users.students} />
          <Metric label="Lecturers" value={state.data.users.lecturers} />
          <Metric label="Modules" value={state.data.modules} />
          <Metric
            label="Published quizzes"
            value={state.data.quizzes.published}
          />
          <Metric label="Open reports" value={state.data.openReports} />
          <Metric label="Suspended users" value={state.data.users.suspended} />
        </div>
      )}
      {ready && tab === 'Users' && (
        /* Account actions require server-side authorization and audit reasons. */
        <div className="card admin-table-wrap">
          <table className="admin-table">
            <caption>Platform users</caption>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>MFA</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(state.data?.data) ? state.data.data : []).map(
                (user) => (
                  <tr key={user.user_id}>
                    <td>
                      {user.full_name}
                      <small>{user.email}</small>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.account_status}</td>
                    <td>{user.mfa_enabled ? 'Enabled' : 'Not enabled'}</td>
                    <td className="admin-actions">
                      <button
                        onClick={() =>
                          act(`/users/${user.user_id}`, {
                            action:
                              user.account_status === 'active'
                                ? 'suspend'
                                : 'activate',
                            reason: 'Account administration',
                          })
                        }
                      >
                        {user.account_status === 'active'
                          ? 'Suspend'
                          : 'Activate'}
                      </button>
                      <button
                        onClick={() =>
                          act(`/users/${user.user_id}`, {
                            action: 'revoke_sessions',
                            reason: 'Security session reset',
                          })
                        }
                      >
                        Revoke sessions
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      {ready && tab === 'Modules' && (
        <div className="card admin-list">
          <h3>All modules</h3>
          {(Array.isArray(state.data?.data) ? state.data.data : []).map(
            (module) => (
              <article key={module.module_id} className="list-row">
                <span>
                  <strong>
                    {module.module_code} · {module.module_name}
                  </strong>
                  <small>Lecturer: {module.lecturer_name}</small>
                </span>
                <span>{module.enrolments} enrolled</span>
              </article>
            ),
          )}
        </div>
      )}
      {ready && tab === 'Moderation' && (
        <div className="admin-list">
          {(!Array.isArray(state.data?.data) ||
            state.data.data.length === 0) && (
            <p className="empty-state">No open reports.</p>
          )}
          {(Array.isArray(state.data?.data) ? state.data.data : []).map(
            (report) => (
              <article className="card" key={report.report_id}>
                <h3>{report.group_name}</h3>
                <p>{report.body}</p>
                <p>Reason: {report.reason}</p>
                <div className="admin-actions">
                  <button
                    onClick={() =>
                      act(`/reports/${report.report_id}`, {
                        status: 'actioned',
                        reason: 'Reviewed by administrator',
                      })
                    }
                  >
                    Action
                  </button>
                  <button
                    onClick={() =>
                      act(`/reports/${report.report_id}`, {
                        status: 'dismissed',
                        reason: 'Report dismissed after review',
                      })
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            ),
          )}
        </div>
      )}
      {ready && tab === 'System' && (
        <div className="admin-metrics">
          <Metric
            label="Database"
            value={state.data.database.healthy ? 'Healthy' : 'Unavailable'}
          />
          <Metric label="AI provider" value={state.data.ai.provider} />
          <Metric label="Queued AI jobs" value={state.data.ai.jobs.queued} />
          <Metric label="Failed AI jobs" value={state.data.ai.jobs.failed} />
        </div>
      )}
      {ready && tab === 'Audit' && (
        <div className="card admin-list">
          <h3>Append-only audit history</h3>
          {(!Array.isArray(state.data?.data) ||
            state.data.data.length === 0) && (
            <p className="empty-state">No admin actions recorded yet.</p>
          )}
          {(Array.isArray(state.data?.data) ? state.data.data : []).map(
            (entry) => (
              <article className="list-row" key={entry.audit_id}>
                <span>
                  <strong>{entry.action}</strong>
                  <small>
                    {entry.admin_name} · {entry.reason}
                  </small>
                </span>
                <time dateTime={entry.created_at}>
                  {new Date(entry.created_at).toLocaleString()}
                </time>
              </article>
            ),
          )}
        </div>
      )}
    </section>
  );
}
