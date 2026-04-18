"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

interface PageSizeSelectProps {
  defaultSize?: number;
}

/**
 * Dropdown for choosing how many notes to show per page.
 * Updates the `size` search param and resets `page` to 1 on change.
 */
export function PageSizeSelect({ defaultSize = 20 }: PageSizeSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = Number(searchParams.get("size") ?? defaultSize);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("size", e.target.value);
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="row" style={{ gap: 6, alignItems: "center", flexShrink: 0 }}>
      <label htmlFor="page-size-select" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
        Per page:
      </label>
      <select
        id="page-size-select"
        value={current}
        onChange={handleChange}
        style={{ width: "auto" }}
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}
