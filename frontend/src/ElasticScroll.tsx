import { motion, useReducedMotionConfig, useSpring } from "framer-motion";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export default function ElasticScroll({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const offset = useSpring(0, { stiffness: 420, damping: 28, mass: 0.55 });
  const [overflowing, setOverflowing] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotionConfig();

  useLayoutEffect(() => {
    const element = container.current;
    const child = content.current;
    if (!element || !child) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const hasOverflow = child.scrollHeight + padding > element.clientHeight + 1;
      setOverflowing(hasOverflow);
      if (!hasOverflow) offset.jump(0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [offset]);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element || reduceMotion || !overflowing) {
      offset.jump(0);
      return;
    }
    let resetTimer: number | undefined;
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY) return;
      const atTop = element.scrollTop <= 1;
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
      if (!((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0))) {
        offset.set(0);
        return;
      }

      // Translated content must not extend the native scroll range during a bounce.
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const delta = event.deltaY * unit;
      const current = offset.get();
      const limit = 22;
      const resistance = 1 - Math.min(Math.abs(current) / limit, 1);
      offset.jump(Math.max(-limit, Math.min(limit, current - delta * 0.19 * resistance)));
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => offset.set(0), 105);
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
      window.clearTimeout(resetTimer);
    };
  }, [offset, overflowing, reduceMotion]);

  return (
    <div
      ref={container}
      className={`${className}${overflowing ? " has-overflow" : " no-overflow"}`}
    >
      <motion.div
        ref={content}
        className="elastic-scroll-content"
        style={{ y: offset }}
      >
        {children}
      </motion.div>
    </div>
  );
}
