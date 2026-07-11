import type { Metadata } from "next";
import { FinancePage } from "./finance-page";

export const metadata: Metadata = {
  title: "收支分析",
};

export default function Page() {
  return <FinancePage />;
}
