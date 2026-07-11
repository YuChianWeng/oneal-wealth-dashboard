import type { Metadata } from "next";
import { StubPage } from "@/lib/stub-page";

export const metadata: Metadata = {
  title: "月度回顧",
};

export default function Page() {
  return (
    <StubPage
      title="月度回顧"
      subtitle="每月財務摘要與歷史比較"
      description="月度回顧即將推出"
    />
  );
}
