import { redirect } from "next/navigation";

/** Phase 3: payroll has only the calculator. Pay periods arrive in Phase 4. */
export default async function PayrollIndexPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  redirect(`/app/${companyId}/payroll/calculator`);
}
