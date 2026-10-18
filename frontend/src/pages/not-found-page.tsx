import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        That screen does not exist.{" "}
        <Link className="font-medium text-slate-900 underline" to="/">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
