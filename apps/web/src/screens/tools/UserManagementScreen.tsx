// User Management (user_management_page.dart): the users list on the left, the form on the
// right, and MDA's ROLE PERMISSIONS grid below. Wording, rules and button sets are MDA's:
//   - New: Cancel · Save User; editing: Cancel · Delete · Update User.
//   - A new user's role starts as "User", which isn't in the list (Q-02); the grid is shown
//     only, nothing enforces it (Q-12).
//   - Only an Admin can save, update or delete; you can't delete yourself or the last Admin.

import {
  NEW_USER_ROLE,
  ROLES,
  ROLE_PERMISSIONS,
  userFieldErrors,
  userMessages as um,
} from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiError, api, unwrap, type OkBody } from '../../api.ts';
import { ConfirmDelete } from '../../components/Dialog.tsx';
import { toast } from '../../components/Toast.tsx';
import { ReportPage } from '../reports/shared.tsx';
import { boxClass } from '../transactions/shared.tsx';

type User = OkBody<Awaited<ReturnType<typeof api.api.users.$get>>>[number];
type Form = {
  userName: string;
  password: string;
  confirmPassword: string;
  role: string;
  isActive: boolean;
};
const BLANK: Form = {
  userName: '',
  password: '',
  confirmPassword: '',
  role: NEW_USER_ROLE,
  isActive: true,
};

const ROLE_TONE: Record<string, string> = {
  Admin: 'border-violet-600/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  Manager: 'border-sky-600/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  Operator: 'border-teal-600/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
};
const RoleBadge = ({ role }: { role: string }) => (
  <span
    className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
      ROLE_TONE[role] ?? 'border-border bg-muted text-muted-foreground'
    }`}
  >
    {role}
  </span>
);

const BTN =
  'flex h-11 cursor-pointer items-center justify-center border-[1.5px] border-foreground px-4 text-[15px] font-semibold disabled:opacity-50';

export function UserManagementScreen() {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => unwrap(api.api.users.$get()) });
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(patch)) delete n[k];
      return n;
    });
  };
  const focusName = () => setTimeout(() => nameRef.current?.focus(), 0);
  const clear = () => {
    setEditing(null);
    setForm(BLANK);
    setErrors({});
    focusName();
  };
  const pick = (u: User) => {
    setEditing(u);
    setForm({
      userName: u.userName,
      password: '',
      confirmPassword: '',
      role: u.role,
      isActive: u.isActive,
    });
    setErrors({});
    focusName();
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const fail = (err: unknown) => {
    if (err instanceof ApiError && err.body.fieldErrors && Object.keys(err.body.fieldErrors).length)
      setErrors(err.body.fieldErrors);
    else toast(err instanceof Error ? err.message : String(err), 'error');
  };

  const submit = async () => {
    const e = userFieldErrors({ ...form, editing: !!editing });
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (editing) {
        const u = await unwrap(
          api.api.users[':code'].$put({ param: { code: editing.userCode }, json: form }),
        );
        setEditing(u);
        setForm((f) => ({ ...f, password: '' }));
        toast(um.updated(u.userName));
      } else {
        const u = await unwrap(api.api.users.$post({ json: form }));
        clear();
        toast(um.created(u.userName));
      }
      await refresh();
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await unwrap(api.api.users[':code'].$delete({ param: { code: editing.userCode } }));
      toast(um.deleted(editing.userName));
      setConfirm(false);
      clear();
      await refresh();
    } catch (err) {
      setConfirm(false);
      fail(err);
    }
    setBusy(false);
  };

  const enter = (next: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      next();
    }
  };
  const label = (id: string, text: string, req?: boolean) => (
    <label htmlFor={id} className="text-[13px] font-semibold text-muted-foreground">
      {text}
      {req && <span className="text-destructive"> *</span>}
    </label>
  );
  const err = (k: string) =>
    errors[k] ? <span className="text-[13px] text-destructive">{errors[k]}</span> : null;
  const list = users.data ?? [];

  return (
    <>
      <ReportPage
        section="tools"
        title={['User', 'Management']}
        subtitle="Tools  ›  User Management"
        print={false}
        filters={null}
      >
        <div className="grid min-h-0 grid-cols-[300px_minmax(0,1fr)] gap-3 max-lg:grid-cols-1">
          {/* Users */}
          <div className="flex min-h-0 flex-col border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="font-mono text-xs font-medium tracking-[0.12em] text-primary-text">
                USERS
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {list.length} record(s)
              </span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_84px_48px] gap-2 border-b border-border bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
              <span>User Name</span>
              <span>Role</span>
              <span>Active</span>
            </div>
            <div className="max-h-[230px] overflow-y-auto max-lg:max-h-[200px]">
              {list.length === 0 && (
                <p className="m-0 py-8 text-center text-sm italic text-muted-foreground">
                  {um.none}
                </p>
              )}
              {list.map((u) => {
                const sel = editing?.userCode === u.userCode;
                return (
                  <button
                    key={u.userCode}
                    type="button"
                    onClick={() => pick(u)}
                    className={`grid min-h-10 w-full cursor-pointer grid-cols-[minmax(0,1fr)_84px_48px] items-center gap-2 border-b border-border/60 px-3 text-left text-sm ${
                      sel ? 'bg-foreground font-semibold text-card' : 'hover:bg-accent'
                    }`}
                  >
                    <span className="truncate">{sel ? `=> ${u.userName}` : u.userName}</span>
                    <span>
                      <RoleBadge role={u.role} />
                    </span>
                    <span className={u.isActive ? 'text-primary-text' : 'text-muted-foreground'}>
                      {u.isActive ? '✓' : '✕'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          <div className="flex flex-col border border-border bg-card">
            <div className="border-b border-border px-3 py-2 font-mono text-xs font-medium tracking-[0.12em] text-primary-text">
              {editing ? 'EDIT USER' : 'NEW USER'}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-x-6 gap-y-2 px-4 py-3 max-md:grid-cols-1">
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  {label('um-name', 'User Name', true)}
                  <input
                    id="um-name"
                    ref={nameRef}
                    autoFocus
                    value={form.userName}
                    placeholder="Enter login username"
                    autoComplete="off"
                    onChange={(e) => set({ userName: e.target.value })}
                    onKeyDown={enter(() => passRef.current?.focus())}
                    className={boxClass(!!errors.userName)}
                  />
                  {err('userName')}
                </div>
                <div className="flex flex-col gap-1">
                  {label('um-pass', editing ? 'New Password' : 'Password', !editing)}
                  <div
                    className={`flex items-center field-box ${errors.password ? 'field-error' : ''}`}
                  >
                    <input
                      id="um-pass"
                      ref={passRef}
                      type={show ? 'text' : 'password'}
                      value={form.password}
                      placeholder={editing ? 'Leave blank to keep current' : 'Enter password'}
                      autoComplete="new-password"
                      onChange={(e) => set({ password: e.target.value })}
                      onKeyDown={enter(() =>
                        editing ? saveRef.current?.focus() : confirmRef.current?.focus(),
                      )}
                      className="h-[32px] min-w-0 flex-1 border-0 bg-transparent px-2.5 text-[15px] outline-none"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShow((s) => !s)}
                      className="h-[32px] cursor-pointer px-2.5 text-xs font-semibold text-muted-foreground"
                    >
                      {show ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {err('password')}
                </div>
                {!editing && (
                  <div className="flex flex-col gap-1">
                    {label('um-confirm', 'Confirm Password', true)}
                    <input
                      id="um-confirm"
                      ref={confirmRef}
                      type={show ? 'text' : 'password'}
                      value={form.confirmPassword}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      onChange={(e) => set({ confirmPassword: e.target.value })}
                      onKeyDown={enter(() => saveRef.current?.focus())}
                      className={boxClass(!!errors.confirmPassword)}
                    />
                    {err('confirmPassword')}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  {label('um-role', 'Role')}
                  <select
                    id="um-role"
                    value={form.role}
                    onChange={(e) => set({ role: e.target.value })}
                    className={`${boxClass()} cursor-pointer`}
                  >
                    {/* "User" is a new user's role, but not one of the choices (Q-02). */}
                    {!ROLES.includes(form.role as (typeof ROLES)[number]) && (
                      <option value={form.role} disabled hidden>
                        {form.role}
                      </option>
                    )}
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex h-[34px] cursor-pointer items-center gap-2 text-sm">
                  <span className="w-14 text-[13px] font-semibold text-muted-foreground">
                    Active
                  </span>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => set({ isActive: e.target.checked })}
                    className="size-4"
                  />
                  <span className={form.isActive ? 'text-primary-text' : 'text-muted-foreground'}>
                    {form.isActive ? 'Yes' : 'No'}
                  </span>
                </label>
                {editing && (
                  <span>
                    <RoleBadge role={form.role} />
                  </span>
                )}
              </div>
            </div>
            <div className="mt-auto flex flex-wrap gap-2 border-t border-border px-4 py-3">
              <button type="button" onClick={clear} className={BTN}>
                Cancel
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => setConfirm(true)}
                  className={`${BTN} border-destructive text-destructive`}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                ref={saveRef}
                disabled={busy}
                onClick={() => void submit()}
                className="flex h-11 min-w-[150px] cursor-pointer items-center justify-center bg-primary px-5 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                {editing ? 'Update User' : 'Save User'}
              </button>
            </div>
          </div>
        </div>

        {/* ROLE PERMISSIONS (display only, Q-12) */}
        <div className="flex min-h-0 flex-col border border-border bg-card">
          <div className="border-b border-border px-3 py-2 font-mono text-xs font-medium tracking-[0.12em] text-primary-text">
            ROLE PERMISSIONS
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted text-left text-xs">
                  <th className="px-3 py-1.5 font-bold text-muted-foreground">Module / Feature</th>
                  {ROLES.map((r) => (
                    <th key={r} className="px-3 py-1.5 text-center font-bold">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLE_PERMISSIONS.map(([feature, ...allowed]) => (
                  <tr key={feature} className="border-t border-border/60">
                    <td className="px-3 py-1 text-muted-foreground">{feature}</td>
                    {allowed.map((ok, i) => (
                      <td
                        key={i}
                        className={`px-3 py-1 text-center ${ok ? 'text-primary-text' : 'text-muted-foreground'}`}
                      >
                        {ok ? '✓' : '–'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ReportPage>
      <ConfirmDelete
        open={confirm}
        title={['Delete', 'User']}
        text={um.deleteConfirm(editing?.userName ?? '')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void remove()}
        busy={busy}
      />
    </>
  );
}
