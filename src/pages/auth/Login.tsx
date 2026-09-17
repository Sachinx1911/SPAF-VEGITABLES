import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Sprout, Store, UserRound } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Field, Input, Checkbox } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/States';
import { useStore } from '../../store/useStore';
import { API_MODE } from '../../lib/api';
import { DEMO_PASSWORD } from '../../data/seed/roles';
import { homePathFor } from '../../lib/nav';

export function LoginPage() {
  const nav = useNavigate();
  const login = useStore((s) => s.login);
  const loginViaApi = useStore((s) => s.loginViaApi);
  const loginAs = useStore((s) => s.loginAs);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) return setError('Enter your email or mobile number.');
    if (!password) return setError('Enter your password.');
    setLoading(true);

    // Against a real backend the password is checked on the server, against
    // that user's own hash. Demo builds still use the in-browser check.
    if (API_MODE) {
      const res = await loginViaApi(identifier, password, remember);
      setLoading(false);
      if (!res.ok) return setError(res.error ?? 'Sign in failed.');
      const user = useStore.getState().apiUser;
      return nav(homePathFor(user?.role ?? 'admin'));
    }

    setTimeout(() => {
      const res = login(identifier, password, remember);
      setLoading(false);
      if (!res.ok) return setError(res.error);
      nav(homePathFor(res.user.role));
    }, 350);
  };

  const demoLogin = (userId: string) => {
    const user = loginAs(userId);
    if (user) nav(homePathFor(user.role));
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white md:flex">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <div className="relative flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-fresh-500"><Sprout size={19} /></div>
          <div>
            <p className="text-[15px] font-bold tracking-tight">SPAF</p>
            <p className="text-[11px] text-white/60">Operations OS</p>
          </div>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-[28px] leading-[1.25] font-semibold tracking-[-0.01em]">
            One system, from the customer's order to the money in your account.
          </h1>
          <p className="mt-3 max-w-sm text-[13.5px] text-white/65">
            Orders, consolidation, purchase, packing, delivery, invoicing and payments — every stage feeds the next, automatically.
          </p>
          <div className="mt-7 grid max-w-sm grid-cols-3 gap-3">
            {[['128', 'SKUs tracked'], ['40', 'Active customers'], ['5', 'Delivery routes']].map(([n, l]) => (
              <div key={l} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2.5">
                <p className="text-[18px] font-semibold">{n}</p>
                <p className="text-[10.5px] text-white/55">{l}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11.5px] text-white/40">SV-PRO AGRO FOODS PVT LTD · Fresh produce, delivered daily</p>
      </div>

      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2.5 md:hidden">
            <div className="grid size-9 place-items-center rounded-lg bg-brand-800 text-white"><Sprout size={19} /></div>
            <div>
              <p className="text-[15px] font-bold tracking-tight text-ink">SPAF</p>
              <p className="text-[11px] text-muted">Operations OS</p>
            </div>
          </div>

          <h2 className="text-[20px] font-semibold text-ink">Sign in</h2>
          <p className="mt-1 text-[13px] text-muted">Enter your credentials to access the operations dashboard.</p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <Field label="Email or mobile number" required>
              {(id) => <Input id={id} value={identifier} onChange={(e) => setIdentifier(e.target.value)} leading={<Mail size={15} />} placeholder="you@svproagro.in" autoComplete="username" />}
            </Field>
            <Field label="Password" required>
              {(id) => (
                <Input
                  id={id} type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  leading={<Lock size={15} />} autoComplete="current-password" placeholder="••••••••"
                  trailing={<button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)} className="pointer-events-auto text-subtle hover:text-ink">{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
                />
              )}
            </Field>
            {error && <InlineError>{error}</InlineError>}
            <div className="flex items-center justify-between">
              <Checkbox label="Remember me" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <button type="button" className="text-[12.5px] font-medium text-brand-700 hover:underline">Forgot password?</button>
            </div>
            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">Sign in</Button>
          </form>

          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-muted">
            <ShieldCheck size={13} className="text-emerald-600" /> Signed in sessions are role-restricted
          </div>

          {/* Sign-in without a password — dev builds only, and never when a real
              backend is configured, since these bypass the server entirely. */}
          {import.meta.env.DEV && !API_MODE && (
            <div className="mt-7 border-t border-line pt-5">
              <p className="mb-2.5 text-center text-[11.5px] font-medium tracking-wide text-subtle uppercase">Demo access</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" icon={UserRound} onClick={() => demoLogin('u_ops')}>Staff demo</Button>
                <Button variant="secondary" icon={Store} onClick={() => demoLogin('u_cust_terrace')}>Customer demo</Button>
              </div>
              <p className="mt-2 text-center text-[11px] text-subtle">Demo password for any account: <code className="rounded bg-canvas px-1 py-0.5">{DEMO_PASSWORD}</code></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
