import { getDashboardStatus } from "@/lib/dashboard-copy";

export default function Home() {
  const status = getDashboardStatus();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section aria-labelledby="dashboard-heading" className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Wealth overview
        </p>
        <h1
          id="dashboard-heading"
          className="text-4xl font-bold tracking-tight"
        >
          {status.heading}
        </h1>
        <p className="text-lg text-slate-600">{status.detail}</p>
      </section>
    </main>
  );
}
