import type { Metadata } from "next";
import GrowthPage from "./growth-page";

export const metadata: Metadata = {
  title: "淨資產成長",
};

export default function Page() {
  return <GrowthPage />;
}
