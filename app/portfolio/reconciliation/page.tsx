import type { Metadata } from "next";
import { ReconciliationPage } from "./reconciliation-page";

export const metadata: Metadata = {
  title: "投資對帳中心",
  description: "核對交割戶現金、未交割交易、持股市值與策略總價值。",
};

export default function Page() {
  return <ReconciliationPage />;
}
