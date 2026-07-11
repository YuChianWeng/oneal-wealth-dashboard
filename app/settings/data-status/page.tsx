import type { Metadata } from "next";
import { StubPage } from "@/lib/stub-page";

export const metadata: Metadata = {
  title: "資料狀態",
};

export default function Page() {
  return (
    <StubPage
      title="資料狀態"
      subtitle="資料來源同步狀態與品質檢核"
      description="資料狀態頁面即將推出"
    />
  );
}
