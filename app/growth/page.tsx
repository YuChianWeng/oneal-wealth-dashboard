import type { Metadata } from "next";
import { StubPage } from "@/lib/stub-page";

export const metadata: Metadata = {
  title: "淨資產成長",
};

export default function Page() {
  return (
    <StubPage
      title="淨資產成長"
      subtitle="淨資產歷史趨勢與成長率"
      description="淨資產成長即將推出"
    />
  );
}
