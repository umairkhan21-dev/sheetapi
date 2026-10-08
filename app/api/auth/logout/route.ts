import { clearAuthCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    await clearAuthCookie();
    return Response.json({ success: true });
  } catch {
    console.error("Logout failed");
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
