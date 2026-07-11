import type { Metadata } from "next";
import { ReviewsPage } from "./reviews-page";

export const metadata: Metadata = {
  title: "月度回顧",
  description: "每月財務摘要與歷史比較",
};

export default function Page() {
  return <ReviewsPage />;
}
