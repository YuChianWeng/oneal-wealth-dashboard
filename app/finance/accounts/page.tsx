import type { Metadata } from "next";
import { StubPage } from "@/lib/stub-page";

export const metadata: Metadata = {
  title: "帳戶與負債",
};

export default function Page() {
  return (
    <StubPage
      title="帳戶與負債"
      subtitle="銀行帳戶、信用卡與信貸總覽"
      description="帳戶與負債即將推出"
    />
  );
}
