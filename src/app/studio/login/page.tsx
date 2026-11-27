import { redirect } from 'next/navigation';
import { authMethods, getAdmin } from '@/lib/admin';
import { devLogin } from '../actions';
import { PasswordForm } from '@/components/studio/PasswordForm';

export const metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  denied: 'That Google account is not allowed into the Studio.',
  state: 'The sign-in link expired. Try again.',
  google: 'Google sign-in failed. Try again.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await getAdmin()) redirect('/studio');
  const { e } = await searchParams;
  const on = authMethods();
  return (
    <main className="login">
      <div className="sheet">
        <h3>Studio</h3>
        <p className="small" style={{ margin: 0 }}>
          Michael&apos;s Gallery, private.
        </p>
        {e && ERRORS[e] && <p className="err">{ERRORS[e]}</p>}
        {on.google && (
          <a className="pill solid" href="/api/auth/google" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }}>
            Sign in with Google
          </a>
        )}
        {on.google && on.password && <p className="or small">or with the Studio password</p>}
        {on.password && <PasswordForm autoFocus={!on.google} />}
        {on.dev && (
          <form action={devLogin}>
            <p className="small">Development mode: no Google client or password is configured yet.</p>
            <button className="pill solid" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
              Enter the Studio
            </button>
          </form>
        )}
        {!on.google && !on.password && !on.dev && (
          <p className="err">Sign-in is not configured. Set ADMIN_PASSWORD, or GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>
        )}
      </div>
    </main>
  );
}
