import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    return Response.json({ user });
  } catch {
    console.error("Current user lookup failed");
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
