import {
  GOOGLE_DISCONNECT_REVOKED_MESSAGE,
  GOOGLE_DISCONNECT_UNCONFIRMED_MESSAGE,
} from "@/lib/google-disconnect-copy";
import { Notice } from "@/app/dashboard/ui";

export function GoogleDisconnectNotice({
  google,
  revoked,
}: {
  google: string | undefined;
  revoked: string | undefined;
}) {
  if (google !== "disconnected") {
    return null;
  }

  if (revoked === "1") {
    return <Notice tone="success">{GOOGLE_DISCONNECT_REVOKED_MESSAGE}</Notice>;
  }

  if (revoked === "0") {
    return (
      <Notice tone="info">{GOOGLE_DISCONNECT_UNCONFIRMED_MESSAGE}</Notice>
    );
  }

  return null;
}
