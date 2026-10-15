import Link from "next/link";
// App bar shared by the board and the story.
export function Header({ current }: { current: "board" | "story" }) {
  return (
    <header className="top">
      <p className="wordmark">Black Box</p>
      <span className="wordmark-sub">Warning signs in maintenance records, before the accident</span>
      <nav className="nav" aria-label="Views">
        <Link href="/" aria-current={current === "board" ? "page" : undefined}>Board</Link>
        <Link href="/story" aria-current={current === "story" ? "page" : undefined}>Story</Link>
      </nav>
    </header>
  );
}
