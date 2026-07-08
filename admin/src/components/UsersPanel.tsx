import { useEffect, useState } from 'react';
import type { Role, User } from '@audioworld/shared';
import { api } from '../api';

const ROLES: Role[] = ['basic', 'superuser', 'admin'];

export default function UsersPanel({ me }: { me: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const changeRole = async (id: string, role: Role) => {
    setError(null);
    try {
      const updated = await api.setUserRole(id, role);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="section">
      <div className="section-title">Users &amp; roles</div>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id} className="user-row">
              <div className="user-row__email">
                {u.email}
                {u.id === me.id && <span className="user-row__you"> (you)</span>}
              </div>
              <select
                className="select"
                value={u.role}
                disabled={u.id === me.id}
                title={u.id === me.id ? 'You cannot change your own role' : 'Change role'}
                onChange={(e) => changeRole(u.id, e.currentTarget.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        superuser = owns &amp; manages their own courses · admin = all courses + users · basic = no access yet
      </p>
    </section>
  );
}
