import { createContext } from "react";
import type { LoginInput, SessionUser, SignupInput } from "@leadflow/shared";

export type AuthContextValue = {
  user: SessionUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
