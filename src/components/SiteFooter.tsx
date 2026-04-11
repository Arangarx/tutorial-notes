import Link from "next/link";

export function SiteFooter() {
  return (
    <footer
      className="site-footer"
      style={{
        marginTop: "auto",
        padding: "20px 24px 28px",
        borderTop: "1px solid var(--border)",
        fontSize: 13,
        color: "var(--muted)",
      }}
    >
      <div
        className="container"
        style={{
          maxWidth: 980,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px 20px",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Link href="/privacy" style={{ textDecoration: "underline" }}>
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" style={{ textDecoration: "underline" }}>
          Terms
        </Link>
      </div>
    </footer>
  );
}
