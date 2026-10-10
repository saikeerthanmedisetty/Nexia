"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

// ─── Types ───────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: Date;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLocked: boolean;
  error: string | null;
  autoLockEnabled: boolean;
  rememberDevice: boolean;
}

export interface AuthContextValue extends AuthState {
  handleLogin: (email: string, password: string, remember?: boolean) => Promise<void>;
  handleSignup: (email: string, password: string, remember?: boolean) => Promise<void>;
  handleLogout: () => Promise<void>;
  handleLock: () => void;
  handleUnlock: (password: string) => Promise<boolean>;
  handleForgotPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  handleResetPassword: (email: string, otp: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  setAutoLockEnabled: (enabled: boolean) => void;
  setRememberDevice: (remember: boolean) => void;
  clearError: () => void;
}

// ─── Context ─────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Storage Keys ────────────────────────────────────────
const TOKEN_KEY = "omni_agent_token";
const REMEMBER_KEY = "omni_agent_remember";
const LOCKED_KEY = "omni_agent_locked";
const AUTOLOCK_KEY = "omni_agent_autolock";
const TAB_ACTIVE_KEY = "omni_tab_active";

function saveToken(token: string, remember: boolean = true) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REMEMBER_KEY, "true");
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TAB_ACTIVE_KEY, "true");
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function removeToken() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  sessionStorage.removeItem(LOCKED_KEY);
  sessionStorage.removeItem(TAB_ACTIVE_KEY);
}

// ─── Provider ────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [autoLockEnabled, setAutoLockEnabledState] = useState(true);

  // Read saved preferences on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedRemember = localStorage.getItem(REMEMBER_KEY) === "true";
      setRememberDevice(savedRemember);

      const savedAutoLock = localStorage.getItem(AUTOLOCK_KEY);
      if (savedAutoLock !== null) {
        setAutoLockEnabledState(savedAutoLock === "true");
      }

      const wasLocked = sessionStorage.getItem(LOCKED_KEY) === "true";
      const isTabActive = sessionStorage.getItem(TAB_ACTIVE_KEY) === "true";
      if (wasLocked || !isTabActive) {
        setIsLocked(true);
      }
    }
  }, []);

  const setAutoLockEnabled = useCallback((enabled: boolean) => {
    setAutoLockEnabledState(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTOLOCK_KEY, String(enabled));
    }
  }, []);

  // ── Restore session on mount ───────────────────────────
  useEffect(() => {
    async function restoreSession() {
      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);

          // Check if this tab is an active open session or a fresh tab launch:
          // sessionStorage is isolated to the tab and wiped by the browser when the tab is closed.
          const isTabActive = typeof window !== "undefined" && sessionStorage.getItem(TAB_ACTIVE_KEY) === "true";
          const wasExplicitlyLocked = typeof window !== "undefined" && sessionStorage.getItem(LOCKED_KEY) === "true";

          if (wasExplicitlyLocked || !isTabActive) {
            // Tab was closed and opened freshly (or locked explicitly): ask for password
            setIsLocked(true);
          } else {
            // Tab is actively open: keep unlocked!
            setIsLocked(false);
          }
        } else {
          removeToken();
        }
      } catch {
        removeToken();
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

  // Note: We DO NOT lock on tab-switching or minimizing/maximizing the screen.
  // The session stays unlocked as long as the tab is open, and only prompts for password when closed and reopened freshly.

  // ── Lock Workspace ─────────────────────────────────────
  const handleLock = useCallback(() => {
    setIsLocked(true);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(TAB_ACTIVE_KEY);
      sessionStorage.setItem(LOCKED_KEY, "true");
    }
  }, []);

  // ── Unlock Workspace ───────────────────────────────────
  const handleUnlock = useCallback(
    async (password: string): Promise<boolean> => {
      if (!user?.email) return false;
      setError(null);

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Incorrect credentials.");
        }

        // Successfully verified
        setIsLocked(false);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(TAB_ACTIVE_KEY, "true");
          sessionStorage.removeItem(LOCKED_KEY);
        }
        if (data.token) {
          saveToken(data.token, rememberDevice);
        }
        return true;
      } catch (err: any) {
        setError(err.message || "Failed to unlock session.");
        return false;
      }
    },
    [user?.email, rememberDevice]
  );

  // ── Login ──────────────────────────────────────────────
  const handleLogin = useCallback(
    async (email: string, password: string, remember: boolean = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Login failed.");
        }

        saveToken(data.token, remember);
        setRememberDevice(remember);
        setUser(data.user);
        setIsLocked(false);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(TAB_ACTIVE_KEY, "true");
          sessionStorage.removeItem(LOCKED_KEY);
        }
      } catch (err: any) {
        setError(err.message || "Login failed.");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // ── Signup ─────────────────────────────────────────────
  const handleSignup = useCallback(
    async (email: string, password: string, remember: boolean = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Signup failed.");
        }

        saveToken(data.token, remember);
        setRememberDevice(remember);
        setUser(data.user);
        setIsLocked(false);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(TAB_ACTIVE_KEY, "true");
          sessionStorage.removeItem(LOCKED_KEY);
        }
      } catch (err: any) {
        setError(err.message || "Signup failed.");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // ── Logout ─────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    try {
      removeToken();
      setUser(null);
      setIsLocked(false);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Forgot Password (Request OTP) ──────────────────────
  const handleForgotPassword = useCallback(
    async (email: string): Promise<{ success: boolean; message: string }> => {
      setError(null);
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send verification code.");
      }

      return data;
    },
    []
  );

  // ── Reset Password (Verify OTP & In-Place Update) ──────
  const handleResetPassword = useCallback(
    async (
      email: string,
      otp: string,
      newPassword: string
    ): Promise<{ success: boolean; message: string }> => {
      setError(null);
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password.");
      }

      return data;
    },
    []
  );

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      isLocked,
      error,
      autoLockEnabled,
      rememberDevice,
      handleLogin,
      handleSignup,
      handleLogout,
      handleLock,
      handleUnlock,
      handleForgotPassword,
      handleResetPassword,
      setAutoLockEnabled,
      setRememberDevice,
      clearError,
    }),
    [
      user,
      isLoading,
      isLocked,
      error,
      autoLockEnabled,
      rememberDevice,
      handleLogin,
      handleSignup,
      handleLogout,
      handleLock,
      handleUnlock,
      handleForgotPassword,
      handleResetPassword,
      setAutoLockEnabled,
      setRememberDevice,
      clearError,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
