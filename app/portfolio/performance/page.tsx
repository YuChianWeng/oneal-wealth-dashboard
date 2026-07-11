import type { Metadata } from "next";
import { StubPage } from "@/lib/stub-page";

export const metadata: Metadata = {
  title: "績效比較",
};

export default function Page() {
  return (
    <StubPage
      title="績效比較"
      subtitle="投資組合 vs 基準指數"
      description="績效比較即將推出"
    />
  );
}
