import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { BATCH_FILE, periodPdfStatus } from "@/modules/documents/service";

export const metadata: Metadata = { title: "Print payslips" };

/**
 * "Print all": a bare page (outside the app shell) that embeds the stored batch PDF and asks
 * the browser to print it as soon as it has loaded. The PDF itself is fetched through the
 * scoped file route, so this page adds no access of its own.
 */
export default async function PrintPayslipsPage({
  params,
}: {
  params: Promise<{ companyId: string; periodId: string }>;
}) {
  const { companyId, periodId } = await params;
  const { user } = await requireCompany(companyId);
  if (!roleCan(user.role, "payroll.view") || !isUuid(periodId)) notFound();
  const status = await periodPdfStatus(await getScope(), companyId, periodId);
  if (!status.batchReady) notFound();
  const src = `/api/files/payslips/${companyId}/${periodId}/${BATCH_FILE}`;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <div
        className="print-bar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          fontSize: 13,
          background: "#1f2937",
          color: "#fff",
        }}
      >
        <span>Payslips — the print dialog opens automatically. If it did not:</span>
        <button
          id="print-btn"
          type="button"
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid #9ca3af",
            background: "#fff",
            color: "#111",
          }}
        >
          Print
        </button>
        <a href={`${src}?download=1`} style={{ color: "#93c5fd" }}>
          Download PDF
        </a>
      </div>
      <iframe id="pdf" title="Payslips" src={src} style={{ flex: 1, border: 0, width: "100%" }} />
      <script
        // Chromium's PDF viewer prints the document when the frame's window is asked to print.
        dangerouslySetInnerHTML={{
          __html: `(function(){var f=document.getElementById('pdf');function p(){try{f.contentWindow.focus();f.contentWindow.print();}catch(e){window.print();}}document.getElementById('print-btn').addEventListener('click',p);f.addEventListener('load',function(){setTimeout(p,600);});})();`,
        }}
      />
      <style>{`@media print { .print-bar { display: none; } }`}</style>
    </div>
  );
}
