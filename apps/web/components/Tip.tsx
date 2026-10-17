"use client";
// One tooltip for the whole page. Any element, HTML or SVG, with a data-tip attribute shows
// its text on hover or keyboard focus. Mounted once in the root layout; the box is kept
// inside the window.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** An inline term with a dotted underline and a tooltip. */
export function Term({ tip, children }: { tip: string; children: React.ReactNode }) {
  return <span className="term" tabIndex={0} data-tip={tip}>{children}</span>;
}

export function TipLayer() {
  const [tip, setTip] = useState<{ el: Element; text: string } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = (e: Event) => (e.target instanceof Element ? e.target.closest("[data-tip]") : null);
    const over = (e: Event) => {
      const el = host(e);
      if (el) setTip((t) => (t?.el === el ? t : { el, text: el.getAttribute("data-tip") ?? "" }));
    };
    const out = (e: MouseEvent | FocusEvent) => {
      const el = host(e);
      if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) setTip(null);
    };
    const hide = () => setTip(null);
    document.addEventListener("mouseover", over);
    document.addEventListener("focusin", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("focusout", out);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("focusin", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("focusout", out);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  // Above the element when there is room, otherwise below; never past the window edges.
  useLayoutEffect(() => {
    if (!tip || !box.current) return setPos(null);
    const r = tip.el.getBoundingClientRect(), w = box.current.offsetWidth, h = box.current.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    setPos({ left, top: r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8 });
  }, [tip]);

  if (!tip?.text) return null;
  return <div ref={box} className="term-tip" role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}>{tip.text}</div>;
}
