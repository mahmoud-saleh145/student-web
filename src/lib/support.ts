/**
 * Contacting the administration, the way the mobile app does it.
 *
 * On the phone, "change password", "forgot password", "contact support",
 * "I need a new device" and "contact the admin about this course" all open
 * WhatsApp (or a call / an e-mail) with a pre-filled message. There is no
 * self-service password reset anywhere in the product: an administrator does
 * it. The web had pointed those flows at the in-app ticket form instead, which
 * cannot work for the one student who most needs it — someone who cannot sign
 * in.
 *
 * The numbers are public contact details, not secrets, so they are
 * `NEXT_PUBLIC_*`. When one is not configured the link is simply not offered.
 */

export type SupportReason = 'password' | 'device' | 'access' | 'payment' | 'general';

export interface SupportContext {
  reason: SupportReason;
  phone?: string;
  fullName?: string;
  courseTitle?: string;
}

export interface SupportConfig {
  phone: string;
  whatsapp: string;
  email: string;
  appVersion: string;
}

export function readSupportConfig(env: Record<string, string | undefined>): SupportConfig {
  return {
    phone: (env.NEXT_PUBLIC_SUPPORT_PHONE ?? '').trim(),
    whatsapp: (env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '').trim(),
    email: (env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '').trim(),
    appVersion: (env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0').trim(),
  };
}

export function composeSupportMessage(ctx: SupportContext, appVersion: string): string {
  const lines = ['Support request from the web app', `Reason: ${ctx.reason}`];
  if (ctx.fullName) lines.push(`Name: ${ctx.fullName}`);
  if (ctx.phone) lines.push(`Phone: ${ctx.phone}`);
  if (ctx.courseTitle) lines.push(`Course: ${ctx.courseTitle}`);
  lines.push(`App: ${appVersion} (web)`);
  return lines.join('\n');
}

export function whatsappUrl(cfg: SupportConfig, ctx: SupportContext): string | null {
  const digits = cfg.whatsapp.replace(/[^\d]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(composeSupportMessage(ctx, cfg.appVersion))}`;
}

export function telUrl(cfg: SupportConfig): string | null {
  const phone = cfg.phone.replace(/[^\d+]/g, '');
  return phone ? `tel:${phone}` : null;
}

export function mailtoUrl(cfg: SupportConfig, ctx: SupportContext): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.email)) return null;
  return `mailto:${cfg.email}?subject=${encodeURIComponent(`Support request — ${ctx.reason}`)}`;
}

/**
 * Read once. `process.env.NEXT_PUBLIC_*` must be referenced literally so Next
 * inlines the values into the browser bundle.
 */
export const supportConfig: SupportConfig = readSupportConfig({
  NEXT_PUBLIC_SUPPORT_PHONE: process.env.NEXT_PUBLIC_SUPPORT_PHONE,
  NEXT_PUBLIC_SUPPORT_WHATSAPP: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
});
