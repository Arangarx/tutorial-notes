"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  LayoutGrid,
  Link2,
  FileText,
  MoreHorizontal,
} from "lucide-react";

import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type StudentDetailSection = {
  id: string;
  label: string;
  mobileLabel: string;
  icon: ReactNode;
  content: ReactNode;
  badge?: number;
};

type StudentDetailShellProps = {
  studentId: string;
  studentName: string;
  meta: ReactNode;
  headerActions: ReactNode;
  overflowActions: ReactNode;
  stickyCta: ReactNode;
  sections: StudentDetailSection[];
  noteCount?: number;
};

const defaultIcons = {
  session: <LayoutGrid className="size-5" aria-hidden />,
  share: <Link2 className="size-5" aria-hidden />,
  notes: <FileText className="size-5" aria-hidden />,
  more: <MoreHorizontal className="size-5" aria-hidden />,
};

const DESKTOP_SECTION_QUERY = "(min-width: 768px)";

export function StudentDetailShell({
  studentName,
  meta,
  headerActions,
  overflowActions,
  stickyCta,
  sections,
  noteCount = 0,
}: StudentDetailShellProps) {
  const [activeTab, setActiveTab] = useState(sections[0]?.id ?? "session");
  const [actionsOpen, setActionsOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const scrollSpyLockRef = useRef(false);
  const scrollSpyUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const setSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el);
    } else {
      sectionRefs.current.delete(id);
    }
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const container = scrollContainerRef.current;
    const section = sectionRefs.current.get(id);
    if (!container || !section) return;

    scrollSpyLockRef.current = true;
    if (scrollSpyUnlockTimerRef.current) {
      clearTimeout(scrollSpyUnlockTimerRef.current);
    }

    const containerTop = container.getBoundingClientRect().top;
    const sectionTop = section.getBoundingClientRect().top;
    const targetTop = sectionTop - containerTop + container.scrollTop;

    container.scrollTo({ top: targetTop, behavior: "smooth" });
    setActiveTab(id);

    scrollSpyUnlockTimerRef.current = setTimeout(() => {
      scrollSpyLockRef.current = false;
    }, 600);
  }, []);

  const handleTabClick = useCallback(
    (id: string) => {
      if (typeof window !== "undefined" && window.matchMedia(DESKTOP_SECTION_QUERY).matches) {
        scrollToSection(id);
        return;
      }
      setActiveTab(id);
    },
    [scrollToSection]
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const mq = window.matchMedia(DESKTOP_SECTION_QUERY);

    const pickActiveFromScroll = () => {
      if (!mq.matches || scrollSpyLockRef.current) return;

      const firstId = sections[0]?.id;
      if (container.scrollTop <= 8 && firstId) {
        setActiveTab(firstId);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const activationLine =
        containerRect.top + Math.min(72, container.clientHeight * 0.12);

      let activeId = firstId ?? null;
      for (const section of sections) {
        const el = sectionRefs.current.get(section.id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        if (rect.top <= activationLine + 2) {
          activeId = section.id;
        }
      }

      if (activeId) {
        setActiveTab(activeId);
      }
    };

    const observer = new IntersectionObserver(
      () => {
        pickActiveFromScroll();
      },
      {
        root: container,
        rootMargin: "-8% 0px -72% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      }
    );

    const observeSections = () => {
      observer.disconnect();
      if (!mq.matches) return;
      sectionRefs.current.forEach((el) => observer.observe(el));
      pickActiveFromScroll();
    };

    observeSections();
    container.addEventListener("scroll", pickActiveFromScroll, { passive: true });

    const onMqChange = () => {
      observeSections();
      if (!mq.matches) {
        setActiveTab(sections[0]?.id ?? "session");
      }
    };

    mq.addEventListener("change", onMqChange);

    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", pickActiveFromScroll);
      mq.removeEventListener("change", onMqChange);
      if (scrollSpyUnlockTimerRef.current) {
        clearTimeout(scrollSpyUnlockTimerRef.current);
      }
    };
  }, [sections]);

  return (
    <div className="flex flex-col pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-4rem)] md:min-h-0 md:pb-0">
      <div className="shrink-0">
        <header className="mb-4 space-y-3 md:mb-6">
          <Link
            href="/admin/students"
            className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
          >
            ← Students
          </Link>
          <div className="flex items-start gap-4">
            <StudentAvatar name={studentName} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="heading text-2xl font-normal tracking-tight text-foreground md:text-3xl">
                {studentName}
              </h1>
              <div className="label-mono mt-1 text-xs text-muted-foreground md:text-sm">{meta}</div>
            </div>
            <div className="hidden shrink-0 flex-wrap items-center gap-2 md:flex">{headerActions}</div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0 rounded-[10px] md:hidden"
              aria-label="More actions"
              onClick={() => setActionsOpen(true)}
            >
              <MoreHorizontal className="size-5" />
            </Button>
          </div>
        </header>

        <div
          className="mb-4 flex flex-col gap-3 rounded-2xl border border-[color:var(--brand-card-border)] bg-brand px-4 py-4 md:mx-0 lg:flex-row lg:items-center"
          data-testid="student-ready-to-teach-banner"
        >
          <div className="min-w-0 flex-1" data-testid="student-ready-to-teach-copy">
            <p className="label-mono m-0 text-[10px] text-[color:var(--brand-eyebrow)]">
              Ready to teach
            </p>
            <p className="mt-1 text-[13px] text-[color:var(--brand-on-subtle)]">
              Start a whiteboard session to record and generate notes.
            </p>
          </div>
          <div className="hidden w-full min-w-0 md:block lg:w-auto lg:shrink-0 [&_button]:whitespace-nowrap">
            {stickyCta}
          </div>
        </div>

        <div
          className="mb-0 hidden gap-1 overflow-x-auto border-b border-border pb-3 md:flex"
          role="tablist"
          aria-label="Student sections"
        >
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`student-tab-${s.id}`}
              aria-selected={activeTab === s.id}
              aria-controls={`student-section-${s.id}`}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                activeTab === s.id
                  ? "bg-accent-soft text-accent-text"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
              onClick={() => handleTabClick(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="hidden min-h-0 flex-1 flex-col gap-4 overflow-y-auto pt-4 md:flex"
      >
        {sections.map((s) => (
          <section
            key={s.id}
            ref={(el) => setSectionRef(s.id, el)}
            id={`student-section-${s.id}`}
            data-section={s.id}
            role="tabpanel"
            aria-labelledby={`student-tab-${s.id}`}
            className="rounded-2xl border border-border bg-card p-[18px] shadow-sm md:p-5"
          >
            {s.content}
          </section>
        ))}
      </div>

      <div className="flex flex-col gap-3.5 md:hidden">
        {sections.map((s) => (
          <section
            key={s.id}
            id={`student-section-mobile-${s.id}`}
            data-section={s.id}
            data-testid={`student-detail-panel-${s.id}`}
            className={cn(
              "rounded-2xl border border-border bg-card p-[18px] shadow-sm",
              activeTab !== s.id && "hidden"
            )}
            aria-label={s.label}
          >
            {s.content}
            {s.id === "session" ? (
              <div
                className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4"
                data-testid="session-tab-escape-hatches"
              >
                <button
                  type="button"
                  onClick={() => handleTabClick("notes")}
                  className="min-h-11 rounded-full bg-accent-soft px-3.5 py-2 text-sm font-semibold text-accent-text hover:bg-accent-soft/80"
                  data-testid="session-escape-notes-count"
                >
                  {noteCount} session note{noteCount !== 1 ? "s" : ""}
                </button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => handleTabClick("notes")}
                  data-testid="session-escape-view-notes"
                >
                  View notes
                </Button>
              </div>
            ) : null}
          </section>
        ))}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] z-10 bg-gradient-to-t from-background from-30% to-transparent px-4 pb-3 pt-6 md:hidden">
        <div className="pointer-events-auto [&_button]:whitespace-nowrap">{stickyCta}</div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex h-[calc(3.75rem+env(safe-area-inset-bottom,0px))] items-stretch border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-sm md:hidden"
        style={{ boxShadow: "0 -6px 16px var(--shadow-sm)" }}
        aria-label="Student sections"
        role="tablist"
        data-testid="student-detail-mobile-tabs"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={activeTab === s.id}
            aria-controls={`student-section-mobile-${s.id}`}
            data-testid={`student-detail-tab-${s.id}`}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 px-1 text-xs transition-colors",
              activeTab === s.id
                ? "bg-accent-soft/70 font-semibold text-accent-text"
                : "font-medium text-muted-foreground"
            )}
            onClick={() => handleTabClick(s.id)}
          >
            <span className="relative flex h-5 items-center [&_svg]:size-5">
              {s.icon}
              {s.badge != null && s.badge > 0 ? (
                <span
                  className="absolute -top-1.5 -right-2.5 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-foreground"
                  aria-hidden
                >
                  {s.badge > 99 ? "99+" : s.badge}
                </span>
              ) : null}
            </span>
            <span className="leading-none">{s.mobileLabel}</span>
          </button>
        ))}
      </nav>

      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <SheetContent side="bottom" className="rounded-t-[20px] px-0 pb-8 pt-3">
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border" aria-hidden />
          <SheetHeader className="sr-only">
            <SheetTitle>Student actions</SheetTitle>
          </SheetHeader>
          <div className="divide-y divide-border px-5">{overflowActions}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export { defaultIcons };
