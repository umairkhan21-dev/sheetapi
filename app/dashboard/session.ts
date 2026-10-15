import { redirect } from "next/navigation";
import { getCurrentUser, type AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireDashboardUser(): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function hasGoogleConnection(userId: number) {
  const connection = await prisma.googleConnection.findUnique({
    where: { userId },
    select: { id: true },
  });

  return connection !== null;
}
