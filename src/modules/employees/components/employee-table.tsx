"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon, SearchIcon } from "lucide-react";
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { EmployeeStatus } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/form/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EMPLOYEE_STATUS_LABELS } from "../schema";
import { cn } from "@/lib/utils";

export type EmployeeListRow = {
  id: string;
  href: string;
  employeeNo: string;
  name: string;
  position: string;
  department: string;
  status: EmployeeStatus;
  hireDate: string; // ISO for sorting
  hireDateLabel: string;
  rate: string;
};

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  filterFns: { includesString: filterFn_includesString, equalsString: filterFn_equalsString },
});

const helper = createColumnHelper<typeof features, EmployeeListRow>();

const columns = helper.columns([
  helper.accessor("employeeNo", { header: "No.", sortFn: "alphanumeric" }),
  helper.accessor("name", { header: "Employee", sortFn: "text" }),
  helper.accessor("position", { header: "Position", sortFn: "text" }),
  helper.accessor("department", { header: "Department", sortFn: "text", filterFn: "equalsString" }),
  helper.accessor("status", { header: "Status", filterFn: "equalsString" }),
  helper.accessor("hireDate", { header: "Hired", sortFn: "alphanumeric" }),
  helper.accessor("rate", { header: "Current rate" }),
]);

const STATUS_VARIANT: Record<EmployeeStatus, "secondary" | "outline" | "destructive"> = {
  ACTIVE: "secondary",
  ON_LEAVE: "outline",
  SEPARATED: "destructive",
};

const EMPTY: EmployeeListRow[] = [];

export function EmployeeTable({
  rows,
  departments,
}: {
  rows: EmployeeListRow[];
  departments: string[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ACTIVE");
  const [department, setDepartment] = useState<string>("");

  const table = useTable({
    features,
    columns,
    data: rows.length ? rows : EMPTY,
    getRowId: (row) => row.id,
    globalFilterFn: "includesString",
    getColumnCanGlobalFilter: (column) =>
      ["employeeNo", "name", "position", "department"].includes(column.id),
    enableSortingRemoval: false,
    initialState: { sorting: [{ id: "name", desc: false }] },
    state: {
      globalFilter: search,
      columnFilters: [
        ...(status ? [{ id: "status", value: status }] : []),
        ...(department ? [{ id: "department", value: department }] : []),
      ],
    },
  });

  const model = table.getRowModel();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, number, position…"
            className="pl-8"
            aria-label="Search employees"
          />
        </div>
        <div className="w-40">
          <NativeSelect
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {(Object.keys(EMPLOYEE_STATUS_LABELS) as EmployeeStatus[]).map((s) => (
              <option key={s} value={s}>
                {EMPLOYEE_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="w-48">
          <NativeSelect
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </NativeSelect>
        </div>
        <p className="ml-auto text-xs text-muted-foreground tabular">
          {model.rows.length} of {rows.length}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(header.column.id === "rate" && "text-right")}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUpIcon className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDownIcon className="size-3" />
                          ) : (
                            <ArrowUpDownIcon className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {model.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  {rows.length === 0 ? "No employees yet." : "No employees match the filters."}
                </TableCell>
              </TableRow>
            ) : (
              model.rows.map((row) => {
                const e = row.original;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{e.employeeNo}</TableCell>
                    <TableCell>
                      <Link href={e.href} className="font-medium hover:underline">
                        {e.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.position || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.department || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[e.status]}>
                        {EMPLOYEE_STATUS_LABELS[e.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm tabular">{e.hireDateLabel}</TableCell>
                    <TableCell className="text-right text-sm tabular">{e.rate}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
