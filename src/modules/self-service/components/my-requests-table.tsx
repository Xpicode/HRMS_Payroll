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
import { LEAVE_STATUS_LABELS } from "@/modules/leave/schema";
import type { RequestView } from "@/modules/leave/service";
import { WithdrawButton } from "./withdraw-button";

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

/** The employee's own requests; pending ones can be withdrawn. */
export function MyRequestsTable({ requests }: { requests: RequestView[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Leave</TableHead>
          <TableHead>Dates</TableHead>
          <TableHead className="text-right">Days</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
              You have not filed any leave yet.
            </TableCell>
          </TableRow>
        ) : (
          requests.map((r) => {
            const start = toIsoDate(r.startDate);
            const end = toIsoDate(r.endDate);
            const closed = r.status === "REJECTED" || r.status === "CANCELLED";
            return (
              <TableRow key={r.id} className={closed ? "text-muted-foreground" : undefined}>
                <TableCell>
                  <span className="font-medium">{r.leaveType.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {r.withPay ? "With pay" : "Without pay"}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </span>
                </TableCell>
                <TableCell className="tabular">
                  {start === end
                    ? formatDateOnly(start)
                    : `${formatDateOnly(start)} – ${formatDateOnly(end)}`}
                  {r.decisionNote ? (
                    <span className="block text-[11px] text-muted-foreground">
                      Note: {r.decisionNote}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular">{fmtDays(r.days)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status]}>{LEAVE_STATUS_LABELS[r.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {r.status === "PENDING" ? (
                    <WithdrawButton
                      requestId={r.id}
                      summary={`${r.leaveType.code} ${start === end ? start : `${start} to ${end}`}`}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
