"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { nhost } from "@/lib/nhost";

type OrgMembership = {
  role: "owner" | "editor" | "viewer";
  organization: {
    id: string;
    name: string;
    quota_used: number;
    quota_limit: number;
    quota_period_start: string;
  };
};

type AppState = {
  isAuthenticated: boolean | null;
  userId: string | null;
  orgs: OrgMembership[];
  currentOrgId: string | null;
  setCurrentOrgId: (id: string) => void;
  refreshOrgs: () => Promise<void>;
};

const AppContext = createContext<AppState | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within Providers");
  return ctx;
}

export function Providers({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);

  async function refreshOrgs() {
    const { MY_ORGS, gql } = await import("@/lib/graphql");
    const data = await gql<{ org_members: OrgMembership[] }>(MY_ORGS);
    setOrgs(data.org_members);

    if (!currentOrgId && data.org_members[0]) {
      setCurrentOrgId(data.org_members[0].organization.id);
    }
  }

  useEffect(() => {
    const unsubscribe = nhost.auth.onAuthStateChanged((event, session) => {
      const authed = event === "SIGNED_IN";

      setIsAuthenticated(authed);
      setUserId(session?.user?.id ?? null);

      if (authed) {
        void refreshOrgs();
      } else {
        setOrgs([]);
        setCurrentOrgId(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        userId,
        orgs,
        currentOrgId,
        setCurrentOrgId,
        refreshOrgs,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
