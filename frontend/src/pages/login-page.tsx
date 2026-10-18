import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { loginSchema } from "@leadflow/shared";
import { useAuth } from "../auth/use-auth";
import { isApiClientError } from "../lib/api-client";
import { env } from "../lib/env";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../mocks/demo";
import { Button } from "../components/ui/button";
import { Field, TextInput } from "../components/ui/field";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  async function signIn(emailValue: string, passwordValue: string) {
    setIsSubmitting(true);
    setError(null);
    try {
      await login({ email: emailValue, password: passwordValue });
      navigate(from, { replace: true });
    } catch (submitError) {
      setError(isApiClientError(submitError) ? submitError.message : "Unable to sign in");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    await signIn(parsed.data.email, parsed.data.password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back to LeadFlow.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Field label="Email" required>
            <TextInput
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Password" required>
            <TextInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-sm text-slate-500">
          No workspace yet?{" "}
          <Link className="font-medium text-slate-900 underline" to="/signup">
            Create one
          </Link>
        </p>

        {env.enableMocks ? (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Demo accounts
            </p>
            <div className="mt-2 grid gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void signIn(account.email, DEMO_PASSWORD)}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  <span>
                    <span className="font-medium text-slate-800">{account.label}</span>
                    <span className="ml-2 text-xs text-slate-500">{account.email}</span>
                  </span>
                  <span className="text-xs text-slate-400">{account.note}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Password for all demo accounts: {DEMO_PASSWORD}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
