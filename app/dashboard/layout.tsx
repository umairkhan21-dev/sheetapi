import type { ReactNode } from "react";
import { DashboardShell } from "@/app/dashboard/dashboard-shell";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: {
    default: "Overview",
    template: "%s · SheetAPI",
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    return children;
  }

  return (
    <DashboardShell user={{ name: user.name, email: user.email }}>
      {children}
    </DashboardShell>
  );
}
