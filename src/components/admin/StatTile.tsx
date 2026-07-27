import { ADMIN_TILE_SHELL_CLASS } from "@/components/admin/admin-tile-shell";

export type StatTileProps = {
  label: string;
  value: string;
  sub?: string;
};

export function StatTile({ label, value, sub }: StatTileProps) {
  return (
    <div className={ADMIN_TILE_SHELL_CLASS}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
