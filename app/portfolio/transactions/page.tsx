import type { Metadata } from "next";
import { StubPage } from "@/lib/stub-page";

export const metadata: Metadata = {
  title: "交易紀錄",
};

export default function Page() {
  return (
    <StubPage
      title="交易紀錄"
      subtitle="歷史買賣交易明細"
      description="交易紀錄即將推出"
    />
  );
}
