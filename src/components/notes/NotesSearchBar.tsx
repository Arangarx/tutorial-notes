"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

interface NotesSearchBarProps {
  placeholder?: string;
  /** aria-label for the input */
  label?: string;
}

/**
 * URL-driven search bar for the notes history page.
 * Updates the `q` search param and resets `page` to 1 on each change.
 */
export function NotesSearchBar({
  placeholder = "Search notes…",
  label = "Search notes",
}: NotesSearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const params = new URLSearchParams(searchParams.toString());
      const val = e.target.value.trim();
      if (val) {
        params.set("q", val);
      } else {
        params.delete("q");
      }
      params.delete("page"); // reset to page 1 on new search
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams]
  );

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
      <label htmlFor="notes-search" className="sr-only">
        {label}
      </label>
      <input
        id="notes-search"
        type="search"
        aria-label={label}
        defaultValue={searchParams.get("q") ?? ""}
        onChange={handleChange}
        placeholder={placeholder}
        style={{ width: "100%", paddingRight: isPending ? 28 : undefined }}
      />
      {isPending && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 12,
            opacity: 0.5,
          }}
        >
          …
        </span>
      )}
    </div>
  );
}
