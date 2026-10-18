import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { signupSchema } from "@leadflow/shared";
import { useAuth } from "../auth/use-auth";
import { isApiClientError } from "../lib/api-client";

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signupSchema.safeParse({ companyName, name, email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await signup(parsed.data);
      navigate("/", { replace: true });
    } catch (submitError) {
      setError(isApiClientError(submitError) ? submitError.message : "Unable to create workspace");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Create your workspace</h1>
        <p className="mt-1 text-sm text-slate-500">You become the Owner of the workspace.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Company name</span>
            <input
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Your name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              required
              minLength={10}
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {isSubmitting ? "Creating workspace..." : "Create workspace"}
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-500">
          Already have an account?{" "}
          <Link className="font-medium text-slate-900 underline" to="/login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
