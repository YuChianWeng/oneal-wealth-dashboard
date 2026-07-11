import type { Metadata } from "next";
import { StubPage } from "@/lib/stub-page";

export const metadata: Metadata = {
  title: "持倉總覽",
};

export default function Page() {
  return (
    <StubPage
      title="持倉總覽"
      subtitle="投資組合持倉與績效"
      description="持倉總覽即將推出"
    />
  );
}
