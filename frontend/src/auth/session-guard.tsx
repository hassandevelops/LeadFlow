import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./use-auth";

function SessionLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
    </div>
  );
}

export function RequireSession() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <SessionLoading />;
  if (!user) {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }

  return <Outlet />;
}

export function RequireGuest() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <SessionLoading />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? "/"} replace />;
  }

  return <Outlet />;
}
