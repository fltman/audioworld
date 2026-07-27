import { useEffect, useMemo, useState } from 'react';
import type { Role, User } from '@audioworld/shared';
import { api } from '../api';

const ROLES: Role[] = ['basic', 'superuser', 'admin'];
const ROLE_CLASS: Record<Role, string> = {
  admin: 'role--admin',
  superuser: 'role--super',
  basic: 'role--basic',
};

/** Initials from an email's local part (up to two letters). */
function initials(email: string): string {
  const name = email.split('@')[0] ?? email;
  const parts = name.split(/[.\-_+]/).filter(Boolean);
  return ((parts[0]?.[0] ?? name[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** A stable hue from the email, so each avatar has its own consistent colour. */
function hue(email: string): number {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % 360;
  return h;
}

function joined(iso: string): string {
  // Deterministic YYYY-MM-DD (no locale/timezone surprises).
  return iso.slice(0, 10);
}

export default function UsersPanel({ me }: { me: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

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

  // Me first, then by role rank, then email.
  const sorted = useMemo(() => {
    const rank: Record<Role, number> = { admin: 0, superuser: 1, basic: 2 };
    return [...users].sort((a, b) => {
      if (a.id === me.id) return -1;
      if (b.id === me.id) return 1;
      return rank[a.role] - rank[b.role] || a.email.localeCompare(b.email);
    });
  }, [users, me.id]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((u) => u.email.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  const counts = useMemo(() => {
    const c: Record<Role, number> = { admin: 0, superuser: 0, basic: 0 };
    for (const u of users) c[u.role]++;
    return c;
  }, [users]);

  return (
    <section className="section users">
      <div className="users__head">
        <div className="section-title" style={{ margin: 0 }}>
          Team <span className="count-pill">{users.length}</span>
        </div>
        {users.length > 4 && (
          <input
            className="input users__search"
            placeholder="Search by email…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
        )}
      </div>

      <div className="role-summary">
        <span className="role role--admin">{counts.admin} admin</span>
        <span className="role role--super">{counts.superuser} superuser</span>
        <span className="role role--basic">{counts.basic} basic</span>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="user-grid">
          {shown.map((u) => {
            const isMe = u.id === me.id;
            return (
              <article key={u.id} className={`user-card${isMe ? ' is-me' : ''}`}>
                <span
                  className="avatar"
                  style={{
                    background: `hsl(${hue(u.email)} 55% 30%)`,
                    color: `hsl(${hue(u.email)} 90% 85%)`,
                  }}
                >
                  {initials(u.email)}
                </span>
                <div className="user-card__body">
                  <div className="user-card__email" title={u.email}>
                    {u.email}
                    {isMe && <span className="user-card__you">you</span>}
                  </div>
                  <div className="user-card__meta">Joined {joined(u.createdAt)}</div>
                </div>
                <select
                  className={`select role-select ${ROLE_CLASS[u.role]}`}
                  value={u.role}
                  disabled={isMe}
                  title={isMe ? 'You cannot change your own role' : 'Change role'}
                  onChange={(e) => void changeRole(u.id, e.currentTarget.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </article>
            );
          })}
        </div>
      )}

      <p className="users__legend muted">
        <b>superuser</b> owns &amp; manages their own courses · <b>admin</b> manages all courses +
        users · <b>basic</b> has no access yet
      </p>
    </section>
  );
}
