"use client";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { stubNavSections } from "@/lib/nav-sections";

export interface StubPageProps {
  title: string;
  subtitle?: string;
  description?: string;
}

/**
 * Reusable stub page for routes that haven't been fully built yet.
 * Each stub wraps the AppShell with an EmptyState in the body.
 */
export function StubPage({ title, subtitle, description }: StubPageProps) {
  return (
    <AppShell navSections={stubNavSections} topbar={{ title, subtitle }}>
      <EmptyState
        title={description ?? `${title}即將推出`}
        description="此模組正在開發中，敬請期待。"
      />
    </AppShell>
  );
}
