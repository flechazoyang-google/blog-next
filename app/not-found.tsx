import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ maxWidth: 480, margin: "20vh auto", padding: "0 24px", textAlign: "center" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2.5rem", color: "var(--text-p0)", margin: "0 0 12px" }}>404</h1>
      <p style={{ color: "var(--text-p3)", marginBottom: 24 }}>这个页面不存在</p>
      <Link href="/" className="btn">回到首页</Link>
    </div>
  );
}
