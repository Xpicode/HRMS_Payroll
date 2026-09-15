import { formatDateTime } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditRow } from "../repo";

const TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CREATE: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
  UPLOAD: "secondary",
  LOGIN: "outline",
  LOGOUT: "outline",
  LOGIN_FAILED: "destructive",
  LOCKOUT: "destructive",
  PASSWORD_CHANGE: "secondary",
  PASSWORD_RESET: "secondary",
};

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <pre className="max-h-80 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-snug">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/** Read-only listing; before/after payloads (already redacted at write time) expand per row. */
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No audit entries match these filters.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-44">When</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Entity</TableHead>
          <TableHead>Company</TableHead>
          <TableHead className="w-32">IP</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const hasDetails = r.before !== null || r.after !== null;
          return (
            <TableRow key={r.id} className="align-top">
              <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                {formatDateTime(r.at)}
              </TableCell>
              <TableCell className="text-sm">
                {r.user ? (
                  <>
                    <span className="font-medium">{r.user.name}</span>
                    <p className="text-xs text-muted-foreground">{r.user.email}</p>
                  </>
                ) : (
                  <span className="text-muted-foreground">System / anonymous</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={TONE[r.action] ?? "outline"}>{r.action}</Badge>
              </TableCell>
              <TableCell className="text-sm">
                <span className="font-medium">{r.entity}</span>
                <p className="font-mono text-[11px] break-all text-muted-foreground">
                  {r.entityId}
                </p>
                {hasDetails ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-primary hover:underline">
                      Details
                    </summary>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <Json label="Before" value={r.before} />
                      <Json label="After" value={r.after} />
                    </div>
                  </details>
                ) : null}
              </TableCell>
              <TableCell className="font-mono text-xs">{r.company?.code ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {r.ip ?? "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
