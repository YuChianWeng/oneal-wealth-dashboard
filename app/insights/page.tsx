import type { Metadata } from "next";
import { StubPage } from "@/lib/stub-page";

export const metadata: Metadata = {
  title: "Insights",
};

export default function Page() {
  return (
    <StubPage
      title="Insights"
      subtitle="智慧分析與提醒"
      description="Insights 即將推出"
    />
  );
}
