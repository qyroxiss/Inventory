// Role Permissions (beyond MDA, added 2026-11-12; core permissions.ts). The Admin chooses, for
// every page, whether a role can't see it (Hidden), can open it without changing anything
// (View only), or can use it fully (Full); and can change single pages for one user.
//   - Left: ROLES (MDA's four, then added ones) or USERS.
//   - Right: every page, grouped as in the menu, with a Hidden / View only / Full choice and a
//     "set all" per group. Cancel puts back what's saved; Save Permissions stores it.
//   - The Admin role and Admin users always have everything; User Management and Role
//     Permissions are for Admins only. Added roles can be renamed or deleted (not while in use).

import {
  ACCESS_LABELS,
  ACCESS_LEVELS,
  ADMIN_ONLY_PAGES,
  PERMISSION_SECTIONS,
  isAdminRole,
  permissionMessages as pm,
  roleNameProblem,
  type Access,
  type PageAccess,
} from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, api, unwrap, type OkBody } from '../../api.ts';
import { ConfirmDelete, Dialog } from '../../components/Dialog.tsx';
import { toast } from '../../components/Toast.tsx';
import { ReportPage } from '../reports/shared.tsx';
import { boxClass } from '../transactions/shared.tsx';

type View = OkBody<Awaited<ReturnType<typeof api.api.permissions.$get>>>;
type Role = View['roles'][number];
type User = View['users'][number];
type Pick = { tab: 'roles'; name: string } | { tab: 'users'; code: string };

const BTN =
  'flex h-11 cursor-pointer items-center justify-center border-[1.5px] border-foreground px-4 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-50';
const MAIN =
  'flex h-11 min-w-[170px] cursor-pointer items-center justify-center bg-primary px-5 text-[15px] font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60';
const HEAD = 'font-mono text-xs font-medium tracking-[0.12em] text-primary-text';

/** Each level's look when chosen. */
const TONE: Record<Access, string> = {
  hidden: 'bg-foreground text-card',
  view: 'bg-amber-500/20 text-amber-800 dark:text-amber-200 ring-1 ring-inset ring-amber-600/50',
  full: 'bg-primary text-primary-foreground',
};

const same = (a: PageAccess, b: PageAccess) =>
  Object.keys({ ...a, ...b }).every((k) => a[k] === b[k]);

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Hidden / View only / Full for one page. */
function LevelPicker({
  value,
  onChange,
  disabled,
  label,
  small,
}: {
  value: Access;
  onChange: (v: Access) => void;
  disabled?: boolean;
  label: string;
  small?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex shrink-0 border-[1.5px] border-border ${disabled ? 'opacity-60' : ''}`}
    >
      {ACCESS_LEVELS.map((l) => {
        const on = value === l;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(l)}
            className={`${small ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-[13px]'} whitespace-nowrap font-semibold max-sm:px-1.5 ${
              on ? TONE[l] : 'text-muted-foreground hover:bg-accent'
            } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {ACCESS_LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}

export function RolePermissionsScreen() {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['permissions'],
    queryFn: () => unwrap(api.api.permissions.$get()),
    retry: false,
  });
  const roles = q.data?.roles ?? [];
  const users = q.data?.users ?? [];

  const [pick, setPick] = useState<Pick>({ tab: 'roles', name: 'Manager' });
  const [draft, setDraft] = useState<PageAccess>({});
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState<Pick | null>(null);
  const [naming, setNaming] = useState<null | 'new' | 'rename'>(null);
  const [deleting, setDeleting] = useState(false);

  const role: Role | undefined =
    pick.tab === 'roles' ? roles.find((r) => r.name === pick.name) : undefined;
  const user: User | undefined =
    pick.tab === 'users' ? users.find((u) => u.userCode === pick.code) : undefined;
  const saved: PageAccess = role?.pages ?? user?.pages ?? {};
  const base: PageAccess | null = user ? user.rolePages : null;
  const locked = role ? role.locked : user ? isAdminRole(user.role) : true;
  const dirty = !same(draft, saved);

  // Load the saved pages whenever another role or user is picked (or the data refreshes).
  const savedKey = JSON.stringify(saved);
  useEffect(() => setDraft(JSON.parse(savedKey) as PageAccess), [savedKey]);

  const choose = (next: Pick) => {
    if (dirty) setLeaving(next);
    else setPick(next);
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['permissions'] });
  const setPage = (page: string, level: Access) => setDraft((d) => ({ ...d, [page]: level }));
  const setGroup = (pages: string[], level: Access) =>
    setDraft((d) => {
      const n = { ...d };
      for (const p of pages) if (!ADMIN_ONLY_PAGES.has(p)) n[p] = level;
      return n;
    });

  const save = async () => {
    setBusy(true);
    try {
      if (role) {
        await unwrap(
          api.api.permissions.roles[':name'].$put({
            param: { name: role.name },
            json: { pages: draft },
          }),
        );
        toast(`Permissions for ${role.name} saved`);
      } else if (user) {
        await unwrap(
          api.api.permissions.users[':code'].$put({
            param: { code: user.userCode },
            json: { pages: draft },
          }),
        );
        toast(`Permissions for ${user.userName} saved`);
      }
      await refresh();
    } catch (err) {
      toast(errorText(err), 'error');
    }
    setBusy(false);
  };

  const removeRole = async () => {
    if (!role) return;
    setBusy(true);
    try {
      await unwrap(api.api.permissions.roles[':name'].$delete({ param: { name: role.name } }));
      toast(`Role ${role.name} deleted`);
      setDeleting(false);
      setPick({ tab: 'roles', name: 'Manager' });
      await refresh();
    } catch (err) {
      setDeleting(false);
      toast(errorText(err), 'error');
    }
    setBusy(false);
  };

  // Not an Admin (the server says so): nothing to show.
  const refused =
    q.error instanceof ApiError ? q.error.body.message : q.error ? errorText(q.error) : '';

  const changedCount = base ? Object.keys(draft).filter((p) => draft[p] !== base[p]).length : 0;
  const title = role ? role.name : user ? user.userName : '';

  return (
    <>
      <ReportPage
        section="tools"
        title={['Role', 'Permissions']}
        subtitle="Tools  ›  Role Permissions"
        print={false}
        filters={null}
      >
        {refused ? (
          <p className="m-0 border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            {refused}
          </p>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] gap-3 max-lg:flex-none max-lg:grid-cols-1">
            {/* Roles / Users */}
            <div className="flex min-h-0 flex-col border border-border bg-card max-lg:max-h-[300px]">
              <div className="flex border-b border-border" role="tablist">
                {(['roles', 'users'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={pick.tab === t}
                    onClick={() =>
                      choose(
                        t === 'roles'
                          ? { tab: 'roles', name: roles[1]?.name ?? 'Manager' }
                          : {
                              tab: 'users',
                              code:
                                users.find((u) => !isAdminRole(u.role))?.userCode ??
                                users[0]?.userCode ??
                                '',
                            },
                      )
                    }
                    className={`flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 ${HEAD} ${
                      pick.tab === t ? 'bg-foreground !text-card' : 'hover:bg-accent'
                    }`}
                  >
                    {t === 'roles' ? 'ROLES' : 'USERS'}
                    <span className="opacity-70">
                      {t === 'roles' ? roles.length : users.length}
                    </span>
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {q.isLoading && (
                  <p className="m-0 py-8 text-center text-sm italic text-muted-foreground">
                    Loading…
                  </p>
                )}
                {pick.tab === 'roles' &&
                  roles.map((r) => {
                    const sel = role?.name === r.name;
                    return (
                      <button
                        key={r.name}
                        type="button"
                        onClick={() => choose({ tab: 'roles', name: r.name })}
                        className={`flex min-h-11 w-full cursor-pointer items-center gap-2 border-b border-border/60 px-3 text-left text-sm ${
                          sel ? 'bg-foreground font-semibold text-card' : 'hover:bg-accent'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {sel ? `=> ${r.name}` : r.name}
                        </span>
                        {!r.builtIn && (
                          <span className="font-mono text-[10px] uppercase opacity-70">added</span>
                        )}
                        <span className="font-mono text-xs opacity-70">
                          {r.users} user{r.users === 1 ? '' : 's'}
                        </span>
                      </button>
                    );
                  })}
                {pick.tab === 'users' &&
                  users.map((u) => {
                    const sel = user?.userCode === u.userCode;
                    const n = Object.keys(u.changes).length;
                    return (
                      <button
                        key={u.userCode}
                        type="button"
                        onClick={() => choose({ tab: 'users', code: u.userCode })}
                        className={`flex min-h-11 w-full cursor-pointer items-center gap-2 border-b border-border/60 px-3 text-left text-sm ${
                          sel ? 'bg-foreground font-semibold text-card' : 'hover:bg-accent'
                        } ${u.isActive ? '' : 'opacity-60'}`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {sel ? `=> ${u.userName}` : u.userName}
                        </span>
                        {n > 0 && (
                          <span className="font-mono text-[10px] uppercase opacity-80">
                            {n} changed
                          </span>
                        )}
                        <span className="font-mono text-xs opacity-70">{u.role}</span>
                      </button>
                    );
                  })}
                {pick.tab === 'users' && !q.isLoading && users.length === 0 && (
                  <p className="m-0 py-8 text-center text-sm italic text-muted-foreground">
                    No users found
                  </p>
                )}
              </div>
              {pick.tab === 'roles' && (
                <div className="grid grid-cols-3 gap-2 border-t border-border p-2">
                  <button
                    type="button"
                    onClick={() => setNaming('new')}
                    className={`${BTN} h-9 whitespace-nowrap !px-1 text-sm`}
                  >
                    New Role
                  </button>
                  <button
                    type="button"
                    disabled={!role || role.builtIn}
                    onClick={() => setNaming('rename')}
                    className={`${BTN} h-9 whitespace-nowrap !px-1 text-sm`}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={!role || role.builtIn}
                    onClick={() => setDeleting(true)}
                    className={`${BTN} h-9 whitespace-nowrap border-destructive !px-1 text-sm text-destructive`}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            {/* Pages */}
            <div className="flex min-h-0 flex-col border border-border bg-card max-lg:min-h-fit">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
                <span className={HEAD}>
                  {pick.tab === 'roles' ? 'ROLE' : 'USER'}
                  {title ? ` · ${title.toUpperCase()}` : ''}
                </span>
                {user && (
                  <span className="text-xs text-muted-foreground">
                    Role: <b className="text-foreground">{user.role}</b>
                    {!locked &&
                      (changedCount
                        ? ` · ${changedCount} page${changedCount === 1 ? '' : 's'} changed from role`
                        : ' · same as role')}
                  </span>
                )}
                <span className="flex-1" />
                {locked && title && (
                  <span className="text-xs font-semibold text-muted-foreground">
                    {pm.adminFixed}
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto max-lg:flex-none max-lg:overflow-visible">
                {title &&
                  PERMISSION_SECTIONS.map((s) => (
                    <div key={s.label}>
                      <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-2 border-b border-border bg-muted px-3 py-1.5">
                        <span className="flex-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {s.label}
                        </span>
                        {!locked && s.pages.some((p) => !ADMIN_ONLY_PAGES.has(p)) && (
                          <span className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground max-sm:hidden">
                              Set all
                            </span>
                            <LevelPicker
                              small
                              label={`Set all ${s.label}`}
                              value={(() => {
                                const ls = new Set(
                                  s.pages
                                    .filter((p) => !ADMIN_ONLY_PAGES.has(p))
                                    .map((p) => draft[p]),
                                );
                                return ls.size === 1 ? ([...ls][0] as Access) : ('' as Access);
                              })()}
                              onChange={(l) => setGroup(s.pages, l)}
                            />
                          </span>
                        )}
                      </div>
                      {s.pages.map((p) => {
                        const adminOnly = ADMIN_ONLY_PAGES.has(p) && !locked;
                        const level = (draft[p] ?? 'hidden') as Access;
                        const changed = base && !locked && base[p] !== level;
                        return (
                          <div
                            key={p}
                            className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-1"
                          >
                            <span className="min-w-[140px] flex-1 text-sm">
                              {p}
                              {adminOnly && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  Admins only
                                </span>
                              )}
                              {changed && (
                                <span className="ml-2 font-mono text-[10px] uppercase text-amber-700 dark:text-amber-300">
                                  changed from role ({ACCESS_LABELS[base[p] as Access]})
                                </span>
                              )}
                            </span>
                            {changed && (
                              <button
                                type="button"
                                onClick={() => setPage(p, base[p] as Access)}
                                className="cursor-pointer text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
                              >
                                Reset
                              </button>
                            )}
                            <LevelPicker
                              label={p}
                              value={level}
                              disabled={locked || adminOnly}
                              onChange={(l) => setPage(p, l)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card px-3 py-3 max-lg:sticky max-lg:bottom-[-16px] max-lg:z-[2] max-sm:bottom-[-8px]">
                <button
                  type="button"
                  disabled={!dirty || busy}
                  onClick={() => setDraft(saved)}
                  className={BTN}
                >
                  Cancel
                </button>
                {user && !locked && (
                  <button
                    type="button"
                    disabled={busy || changedCount === 0}
                    onClick={() => base && setDraft(base)}
                    className={BTN}
                  >
                    Reset to Role
                  </button>
                )}
                <span className="flex-1" />
                {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
                <button
                  type="button"
                  disabled={!dirty || busy || locked}
                  onClick={() => void save()}
                  className={MAIN}
                >
                  Save Permissions
                </button>
              </div>
            </div>
          </div>
        )}
      </ReportPage>

      <RoleNameDialog
        mode={naming}
        role={role}
        roles={roles}
        onClose={() => setNaming(null)}
        onDone={async (name) => {
          setNaming(null);
          await refresh();
          setPick({ tab: 'roles', name });
        }}
      />
      <ConfirmDelete
        open={deleting}
        title={['Delete', 'Role']}
        text={`Delete role "${role?.name ?? ''}"?`}
        onCancel={() => setDeleting(false)}
        onConfirm={() => void removeRole()}
        busy={busy}
      />
      <ConfirmDelete
        open={!!leaving}
        title={['Unsaved', 'Changes']}
        text={`Your changes for ${title} are not saved. Leave without saving?`}
        confirmLabel="Discard"
        cancelLabel="Stay"
        onCancel={() => setLeaving(null)}
        onConfirm={() => {
          if (leaving) setPick(leaving);
          setLeaving(null);
        }}
      />
    </>
  );
}

/** New Role (with "Copy pages from") or Rename. */
function RoleNameDialog({
  mode,
  role,
  roles,
  onClose,
  onDone,
}: {
  mode: null | 'new' | 'rename';
  role: Role | undefined;
  roles: Role[];
  onClose: () => void;
  onDone: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [copyFrom, setCopyFrom] = useState('Manager');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const others = useMemo(
    () => roles.map((r) => r.name).filter((n) => mode !== 'rename' || n !== role?.name),
    [roles, mode, role],
  );

  useEffect(() => {
    if (!mode) return;
    setName(mode === 'rename' ? (role?.name ?? '') : '');
    setCopyFrom(role && !role.locked ? role.name : 'Manager');
    setError('');
  }, [mode, role]);

  const submit = async () => {
    const problem = roleNameProblem(name, others);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      if (mode === 'new') {
        await unwrap(api.api.permissions.roles.$post({ json: { name: name.trim(), copyFrom } }));
        toast(`Role ${name.trim()} created`);
      } else if (role) {
        await unwrap(
          api.api.permissions.roles[':name'].rename.$put({
            param: { name: role.name },
            json: { name: name.trim() },
          }),
        );
        toast(`Role renamed to ${name.trim()}`);
      }
      await onDone(name.trim());
    } catch (err) {
      if (err instanceof ApiError && err.body.fieldErrors?.name)
        setError(err.body.fieldErrors.name);
      else toast(errorText(err), 'error');
    }
    setBusy(false);
  };

  return (
    <Dialog
      open={!!mode}
      onClose={onClose}
      title={mode === 'rename' ? ['Rename', 'Role'] : ['New', 'Role']}
      className="w-[440px]"
    >
      <form
        className="flex flex-col gap-3 px-[26px] pb-[22px] pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="rp-name" className="text-[13px] font-semibold text-muted-foreground">
            Role Name<span className="text-destructive"> *</span>
          </label>
          <input
            id="rp-name"
            autoFocus
            value={name}
            maxLength={30}
            autoComplete="off"
            placeholder="e.g. Cashier"
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            className={boxClass(!!error)}
          />
          {error && <span className="text-[13px] text-destructive">{error}</span>}
        </div>
        {mode === 'new' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="rp-copy" className="text-[13px] font-semibold text-muted-foreground">
              Copy pages from
            </label>
            <select
              id="rp-copy"
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              className={`${boxClass()} cursor-pointer`}
            >
              {roles
                .filter((r) => !r.locked)
                .map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2.5 pt-1">
          <button type="button" onClick={onClose} className={BTN}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={`${MAIN} min-w-[120px]`}>
            {mode === 'rename' ? 'Rename' : 'Create'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
