import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import nodemailer from "nodemailer";

const DEV_MAIL_DIR = path.join(process.cwd(), "tmp", "dev-mail");

type SmtpConfig = {
  host: string;
  port: number;
  from: string;
  user?: string;
  pass?: string;
};

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;

  if (!host && !portRaw && !from && !user && !pass) {
    return null;
  }

  const port = Number(portRaw);

  if (
    !host ||
    !from ||
    /[\r\n]/.test(host) ||
    /[\r\n]/.test(from) ||
    !from.includes("@") ||
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535 ||
    (user && !pass) ||
    (!user && pass)
  ) {
    throw new Error("Email transport is not configured");
  }

  return {
    host,
    port,
    from,
    user: user || undefined,
    pass: pass || undefined,
  };
}

export function assertEmailTransportConfigured() {
  const smtp = readSmtpConfig();

  if (!smtp && process.env.NODE_ENV === "production") {
    throw new Error("Email transport is not configured");
  }
}

export function assertPasswordResetDeliveryReady() {
  getAppUrl();
  assertEmailTransportConfigured();
}

export function getAppUrl() {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, "");

  if (!configured) {
    if (process.env.NODE_ENV !== "production") {
      return "http://localhost:3000";
    }

    throw new Error("APP_URL is not configured");
  }

  if (process.env.NODE_ENV !== "production") {
    if (!/^https?:\/\//.test(configured)) {
      throw new Error("APP_URL is not configured");
    }

    return configured;
  }

  let url: URL;

  try {
    url = new URL(configured);
  } catch {
    throw new Error("APP_URL is invalid");
  }

  if (url.protocol !== "https:") {
    throw new Error("APP_URL must use https in production");
  }

  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== "/" ||
    url.hostname === ""
  ) {
    throw new Error("APP_URL is invalid");
  }

  return url.origin;
}

export function buildPasswordResetUrl(appUrl: string, token: string) {
  const url = new URL("/reset-password", `${appUrl}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

function passwordResetText(resetUrl: string) {
  return [
    "You requested a password reset for your SheetAPI account.",
    "",
    "Open this link to choose a new password:",
    resetUrl,
    "",
    "This link expires in 1 hour and can only be used once.",
    "If you did not request this, you can ignore this email.",
  ].join("\n");
}

async function writeDevelopmentEmail(to: string, resetUrl: string) {
  await mkdir(DEV_MAIL_DIR, { recursive: true });

  const safeRecipient = to.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  const filename = `${Date.now()}-${safeRecipient}-${randomBytes(4).toString("hex")}.txt`;
  const contents = [
    `To: ${to}`,
    "Subject: Reset your SheetAPI password",
    "",
    passwordResetText(resetUrl),
    "",
  ].join("\n");

  await writeFile(path.join(DEV_MAIL_DIR, filename), contents, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const smtp = readSmtpConfig();

  if (!smtp) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email transport is not configured");
    }

    await writeDevelopmentEmail(to, resetUrl);
    return;
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth:
      smtp.user && smtp.pass
        ? { user: smtp.user, pass: smtp.pass }
        : undefined,
  });

  await transport.sendMail({
    from: smtp.from,
    to,
    subject: "Reset your SheetAPI password",
    text: passwordResetText(resetUrl),
  });
}
