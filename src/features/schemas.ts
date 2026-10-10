import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 8;
export const MIN_NAME_PARTS = 3;

const nameParts = (value: string) =>
  value.trim().split(/\s+/).filter(Boolean).length;
const NAME_CHARS = /^[\p{Script=Arabic}\p{Script=Latin}\s'’.ـ-]+$/u;
const PHONE = /^(?:\+?20|0020|0)?1[0125]\d{8}$/;

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[\s()-]/g, "");
  const stripped = digits.replace(/^(?:\+?20|0020)/, "");
  return stripped.startsWith("0") ? stripped : `0${stripped}`;
}

export const phoneSchema = z
  .string()
  .min(1, "validation.required")
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine((v) => PHONE.test(v), "validation.phoneInvalid")
  .transform(normalizePhone);

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, "validation.passwordMin")
  .refine((v) => /[a-z؀-ۿ]/.test(v), "validation.passwordLower")
  .refine((v) => /[A-Z]/.test(v) || /[؀-ۿ]/.test(v), "validation.passwordUpper")
  .refine((v) => /\d/.test(v), "validation.passwordDigit");

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, "validation.required")
  .refine((v) => NAME_CHARS.test(v), "validation.fullNameChars")
  .refine((v) => nameParts(v) >= MIN_NAME_PARTS, "validation.fullNameParts");

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "validation.required"),
});

export type LoginInput = z.input<typeof loginSchema>;

export const registerAccountSchema = z
  .object({
    fullName: fullNameSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "validation.required"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "validation.passwordMatch",
    path: ["confirmPassword"],
  });

/**
 * The academic half of registration.
 *
 * No `studyType`, and no academic system of any kind. The student names a
 * university, a college, a department and the rung they are on; whether that
 * rung is "First Year" or "Level 100" is the college's configuration, resolved
 * server-side from the college's override or its university's default.
 *
 * `studyType` used to be required here and was used to relabel the next two
 * dropdowns, which made the student choose their own progression system — and
 * meant the web app sent a field the mobile app never sent, so the same backend
 * rejected one client and accepted the other.
 */
export const registerAcademicSchema = z.object({
  universityId: z.string().min(1, "validation.selectOption"),
  facultyId: z.string().min(1, "validation.selectOption"),
  departmentId: z.string().min(1, "validation.selectOption"),
  academicYearId: z.string().min(1, "validation.selectOption"),
  gender: z.enum(["MALE", "FEMALE"], { message: "validation.selectOption" }),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "validation.required"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "validation.required"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "validation.passwordMatch",
    path: ["confirmPassword"],
  });

export const updateProfileSchema = z.object({ fullName: fullNameSchema });

export const accessCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, "validation.codeFormat")
    .transform((v) => v.toUpperCase()),
});

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export function passwordStrength(value: string): {
  score: number;
  level: PasswordStrength;
} {
  let score = 0;
  if (value.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  const level: PasswordStrength =
    score <= 1
      ? "weak"
      : score === 2
        ? "fair"
        : score === 3
          ? "good"
          : "strong";
  return { score: Math.min(score, 5), level };
}
