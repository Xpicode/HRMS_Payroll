import { describe, expect, it } from "vitest";
import {
  canActAsEmployee,
  canActOnEmployee,
  PERMISSIONS,
  roleCan,
  STAFF_ROLES,
} from "@/lib/permissions";
import {
  homePathFor,
  isEmployeeRole,
  passwordPathFor,
  pathAllowedFor,
  postLoginPath,
} from "@/lib/routes";
import { checkPasswordPolicy, EMPLOYEE_TEMP_PASSWORD } from "@/lib/password";
import { employeeLoginSchema, staffRoleSchema } from "@/modules/auth/schema";
import { PORTAL_SECTIONS, selfLeaveRequestSchema } from "@/modules/self-service/schema";

const ME = "01a09ebb-0000-7000-8000-00000000aaaa";
const OTHER = "01a09ebb-0000-7000-8000-00000000bbbb";

describe("EMPLOYEE role (self-service)", () => {
  it("has no staff permission at all", () => {
    for (const permission of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(roleCan("EMPLOYEE", permission), permission).toBe(false);
    }
  });

  it("may act only on its own employee record", () => {
    const me = { role: "EMPLOYEE" as const, employeeId: ME };
    expect(canActOnEmployee(me, "employees.view", ME)).toBe(true);
    expect(canActOnEmployee(me, "leave.request", ME)).toBe(true);
    expect(canActOnEmployee(me, "employees.view", OTHER)).toBe(false);
    // an EMPLOYEE user without a linked record can do nothing
    expect(canActOnEmployee({ role: "EMPLOYEE", employeeId: null }, "employees.view", ME)).toBe(
      false,
    );
    // staff go through the normal matrix and are not "self"
    expect(canActOnEmployee({ role: "ENCODER", employeeId: null }, "employees.view", OTHER)).toBe(
      true,
    );
    expect(canActOnEmployee({ role: "ENCODER", employeeId: null }, "payroll.view", OTHER)).toBe(
      false,
    );
  });

  it("company-level reads are open to a linked employee but not a staff role without the permission", () => {
    expect(canActAsEmployee({ role: "EMPLOYEE", employeeId: ME }, "leave.view")).toBe(true);
    expect(canActAsEmployee({ role: "EMPLOYEE", employeeId: null }, "leave.view")).toBe(false);
    expect(canActAsEmployee({ role: "ENCODER", employeeId: null }, "payroll.view")).toBe(false);
  });

  it("is not a role the Users screen can assign", () => {
    expect(STAFF_ROLES).not.toContain("EMPLOYEE");
    expect(staffRoleSchema.safeParse("EMPLOYEE").success).toBe(false);
    expect(staffRoleSchema.safeParse("ENCODER").success).toBe(true);
  });
});

describe("portal routing", () => {
  it("separates /app (staff) from /me (employees)", () => {
    expect(isEmployeeRole("EMPLOYEE")).toBe(true);
    expect(isEmployeeRole("ADMIN")).toBe(false);
    expect(homePathFor("EMPLOYEE")).toBe("/me");
    expect(homePathFor("ENCODER")).toBe("/app");
    expect(passwordPathFor("EMPLOYEE")).toBe("/me/password");
    expect(passwordPathFor("ADMIN")).toBe("/app/account/password");

    expect(pathAllowedFor("EMPLOYEE", "/me/payslips")).toBe(true);
    expect(pathAllowedFor("EMPLOYEE", "/app")).toBe(false);
    expect(pathAllowedFor("EMPLOYEE", "/app/anything")).toBe(false);
    expect(pathAllowedFor("EMPLOYEE", "/apple")).toBe(true); // prefix must be a path segment
    expect(pathAllowedFor("PAYROLL_OFFICER", "/me")).toBe(false);
    expect(pathAllowedFor("PAYROLL_OFFICER", "/app/x")).toBe(true);
    expect(pathAllowedFor("PAYROLL_OFFICER", "/menu")).toBe(true);
  });

  it("sends each user to its own area after sign-in, password page first when required", () => {
    expect(postLoginPath("EMPLOYEE", false, "/app")).toBe("/me");
    expect(postLoginPath("EMPLOYEE", false, "/app/uuid/payroll")).toBe("/me");
    expect(postLoginPath("EMPLOYEE", false, "/me/leave")).toBe("/me/leave");
    expect(postLoginPath("EMPLOYEE", true, "/me/leave")).toBe("/me/password");
    expect(postLoginPath("ADMIN", false, "/me")).toBe("/app");
    expect(postLoginPath("ADMIN", false, "/app/users")).toBe("/app/users");
    expect(postLoginPath("ENCODER", true, "/app/users")).toBe("/app/account/password");
  });

  it("every portal section lives under /me", () => {
    for (const s of PORTAL_SECTIONS) expect(pathAllowedFor("EMPLOYEE", s.href)).toBe(true);
  });
});

describe("self-service schemas", () => {
  it("employee login needs only a valid email (the temporary password is fixed)", () => {
    expect(employeeLoginSchema.safeParse({ email: "Juan@Example.com" })).toMatchObject({
      success: true,
      data: { email: "juan@example.com" },
    });
    expect(employeeLoginSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(EMPLOYEE_TEMP_PASSWORD).toBe("123456789");
    // the temporary value is deliberately outside the policy, so it can never be kept
    expect(checkPasswordPolicy(EMPLOYEE_TEMP_PASSWORD).ok).toBe(false);
  });

  it("self leave request has no employee field and checks the range", () => {
    const ok = selfLeaveRequestSchema.safeParse({
      leaveTypeId: ME,
      startDate: "2026-10-05",
      endDate: "2026-10-06",
      withPay: "on",
      reason: "",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.withPay).toBe(true);
      expect(ok.data.reason).toBeNull();
      expect("employeeId" in ok.data).toBe(false);
    }
    const bad = selfLeaveRequestSchema.safeParse({
      leaveTypeId: ME,
      startDate: "2026-10-06",
      endDate: "2026-10-05",
    });
    expect(bad.success).toBe(false);
  });
});
