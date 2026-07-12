import type { Metadata } from "next";
import { FinancePage } from "./finance-page";

export const metadata: Metadata = {
  title: "收支分析",
  description: "收入與支出趨勢、分類分析",
};

type SearchParams = Promise<{ month?: string | string[] }>;

function taipeiCurrentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : "1970-01";
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedMonth = Array.isArray(params.month)
    ? params.month[0]
    : params.month;
  const month =
    requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
      ? requestedMonth
      : taipeiCurrentMonth();

  return <FinancePage initialMonth={month} />;
}
