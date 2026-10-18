import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { App } from "./app";
import { AuthProvider } from "./auth/auth-provider";
import { ToastProvider } from "./components/ui/toast";
import { env } from "./lib/env";
import { queryClient } from "./lib/query-client";
import "./index.css";

async function enableMocking(): Promise<void> {
  if (!env.enableMocks) return;
  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledFrame: "bypass" });
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found");

enableMocking().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
});
