import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        That dashboard page does not exist.
      </p>
      <Link
        href="/dashboard"
        className="mt-4 inline-block text-sm font-medium text-green-700 hover:underline"
      >
        Back to overview
      </Link>
    </div>
  );
}
