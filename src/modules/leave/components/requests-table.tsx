import Link from "next/link";
import { formatDateOnly, toIsoDate } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LEAVE_STATUS_LABELS } from "../schema";
import type { RequestView } from "../service";
import { RequestActions } from "./request-actions";

const STATUS_VARIANT = {
  PENDING: "default",
  APPROVED: "secondary",
  REJECTED: "outline",
  CANCELLED: "outline",
} as const;

const fmtDays = (v: { toString(): string }) => {
  const n = Number(v.toString());
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

export function RequestsTable({
  companyId,
  requests,
  canApprove,
  canRequest,
  returnTo,
  showEmployee = true,
  emptyText = "No leave requests.",
}: {
  companyId: string;
  requests: RequestView[];
  canApprove: boolean;
  canRequest: boolean;
  returnTo: string | null;
  showEmployee?: boolean;
  emptyText?: string;
}) {
  const cols = 6 + (showEmployee ? 1 : 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showEmployee ? <TableHead>Employee</TableHead> : null}
          <TableHead>Leave</TableHead>
          <TableHead>Dates</TableHead>
          <TableHead className="text-right">Days</TableHead>
          <TableHead>Pay</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 ? (
          <TableRow>
            <TableCell colSpan={cols} className="py-10 text-center text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        ) : (
          requests.map((r) => {
            const start = toIsoDate(r.startDate);
            const end = toIsoDate(r.endDate);
            const closed = r.status === "REJECTED" || r.status === "CANCELLED";
            return (
              <TableRow key={r.id} className={closed ? "text-muted-foreground" : undefined}>
                {showEmployee ? (
                  <TableCell>
                    <Link
                      href={`/app/${companyId}/employees/${r.employee.id}/leave`}
                      className="font-medium hover:underline"
                    >
                      {r.employee.lastName}, {r.employee.firstName}
                    </Link>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {r.employee.employeeNo}
                    </span>
                  </TableCell>
                ) : null}
                <TableCell>
                  <span className="font-medium">{r.leaveType.name}</span>
                  <span className="block max-w-64 truncate text-[11px] text-muted-foreground">
                    {r.reason ?? ""}
                    {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                  </span>
                </TableCell>
                <TableCell className="tabular">
                  {start === end
                    ? formatDateOnly(start)
                    : `${formatDateOnly(start)} – ${formatDateOnly(end)}`}
                  <span className="block text-[11px] text-muted-foreground">
                    by {r.encodedBy?.name ?? "—"}
                    {r.decidedBy
                      ? ` · ${LEAVE_STATUS_LABELS[r.status].toLowerCase()} by ${r.decidedBy.name}`
                      : ""}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular">{fmtDays(r.days)}</TableCell>
                <TableCell className="text-xs">{r.withPay ? "With pay" : "Without pay"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status]}>{LEAVE_STATUS_LABELS[r.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <RequestActions
                    companyId={companyId}
                    requestId={r.id}
                    status={r.status}
                    canApprove={canApprove}
                    canRequest={canRequest}
                    returnTo={returnTo}
                    withPay={r.withPay}
                    summary={`${r.leaveType.code} ${start === end ? start : `${start} to ${end}`} for ${r.employee.lastName}, ${r.employee.firstName}`}
                  />
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
