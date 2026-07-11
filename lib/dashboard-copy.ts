export type DashboardStatus = {
  heading: string;
  detail: string;
};

export function getDashboardStatus(): DashboardStatus {
  return {
    heading: "Oneal Wealth Dashboard",
    detail: "Read-only v1 · no financial records are changed.",
  };
}
