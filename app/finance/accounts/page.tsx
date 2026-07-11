import type { Metadata } from "next";
import { AccountsPage } from "./accounts-page";

export const metadata: Metadata = {
  title: "帳戶與負債",
  description: "銀行帳戶、信用卡與信貸總覽",
};

export default function Page() {
  return <AccountsPage />;
}
