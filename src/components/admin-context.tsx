"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Client-side mirror of the server's isAdmin() — drives which UI renders.
// Purely cosmetic: every mutation is re-checked server-side, so hiding a
// button here is UX, not security.
const AdminContext = createContext<{ admin: boolean; loading: boolean }>({
  admin: false,
  loading: true,
});

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({ admin: false, loading: true });

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setState({ admin: !!d.admin, loading: false }))
      .catch(() => alive && setState({ admin: false, loading: false }));
    return () => {
      alive = false;
    };
  }, []);

  return <AdminContext.Provider value={state}>{children}</AdminContext.Provider>;
}

export const useAdmin = () => useContext(AdminContext);
