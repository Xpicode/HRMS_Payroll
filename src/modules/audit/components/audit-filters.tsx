import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/form/native-select";
import type { AuditFilter } from "../schema";

type Options = {
  entities: string[];
  actions: string[];
  users: { id: string; name: string; email: string }[];
  companies: { id: string; code: string }[];
};

/** Plain GET form: the URL is the filter state, so a view can be bookmarked or shared. */
export function AuditFilters({ filter, options }: { filter: AuditFilter; options: Options }) {
  const active = Object.entries(filter).some(([k, v]) => k !== "page" && v !== undefined);
  return (
    <form
      method="get"
      className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="space-y-1">
        <Label htmlFor="f-user">User</Label>
        <NativeSelect id="f-user" name="userId" defaultValue={filter.userId ?? ""}>
          <option value="">Anyone</option>
          {options.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-company">Company</Label>
        <NativeSelect id="f-company" name="companyId" defaultValue={filter.companyId ?? ""}>
          <option value="">Any</option>
          {options.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-entity">Entity</Label>
        <NativeSelect id="f-entity" name="entity" defaultValue={filter.entity ?? ""}>
          <option value="">Any</option>
          {options.entities.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-action">Action</Label>
        <NativeSelect id="f-action" name="action" defaultValue={filter.action ?? ""}>
          <option value="">Any</option>
          {options.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-entity-id">Entity id</Label>
        <Input
          id="f-entity-id"
          name="entityId"
          defaultValue={filter.entityId ?? ""}
          placeholder="uuid or email"
          className="h-8 font-mono text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-from">From</Label>
        <Input
          id="f-from"
          name="from"
          type="date"
          defaultValue={filter.from ?? ""}
          className="h-8"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-to">To</Label>
        <Input id="f-to" name="to" type="date" defaultValue={filter.to ?? ""} className="h-8" />
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" className="flex-1">
          <SearchIcon data-icon="inline-start" />
          Filter
        </Button>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/app/audit" />}
            nativeButton={false}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}
