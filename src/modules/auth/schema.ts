import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { checkPasswordPolicy, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";

export const emailSchema = z
  .email("Enter a valid email address")
  .max(254)
  .transform((s) => s.trim().toLowerCase());

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const roleSchema = z.enum(Role);

const uuidList = z.preprocess(
  (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.uuid()).max(200),
);

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

function applyPolicy<T extends { password: string; email?: string }>(
  ctx: z.RefinementCtx,
  data: T,
) {
  const res = checkPasswordPolicy(data.password, data.email);
  if (!res.ok) {
    ctx.addIssue({ code: "custom", path: ["password"], message: res.reasons.join(". ") });
  }
}

export const createUserSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().min(2, "Enter the person's name").max(100),
    role: roleSchema,
    password: newPassword,
    companyIds: uuidList,
  })
  .superRefine((d, ctx) => applyPolicy(ctx, d));
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(2, "Enter the person's name").max(100),
  role: roleSchema,
  isActive: checkbox,
  companyIds: uuidList,
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z
  .object({ password: newPassword })
  .superRefine((d, ctx) => applyPolicy(ctx, d));
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(PASSWORD_MAX_LENGTH),
    password: newPassword,
    confirm: z.string(),
  })
  .superRefine((d, ctx) => {
    applyPolicy(ctx, d);
    if (d.password !== d.confirm) {
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "Passwords do not match" });
    }
    if (d.password === d.currentPassword) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Choose a different password" });
    }
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
