import type { Metadata } from "next";
import DataStatusPage from "./data-status-page";

export const metadata: Metadata = {
  title: "資料狀態",
};

export default function Page() {
  return <DataStatusPage />;
}
