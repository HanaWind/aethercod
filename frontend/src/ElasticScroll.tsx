import { motion, useReducedMotionConfig } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type WheelEvent } from "react";

export default function ElasticScroll({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotionConfig();
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => window.clearTimeout(resetTimer.current),
    [],
  );

  useLayoutEffect(() => {
    const element = container.current;
    const child = content.current;
    if (!element || !child) return;
    const measure = () => {
      const hasOverflow = child.scrollHeight > element.clientHeight + 1;
      setOverflowing(hasOverflow);
      if (!hasOverflow) setOffset(0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [children]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (reduceMotion || !overflowing) return;
    const element = event.currentTarget;
    if (
      event.target instanceof Element &&
      event.target.closest(".dropdown-menu, .color-picker-popover, .type-icon-menu")
    )
      return;
    const atTop = element.scrollTop <= 0;
    const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
    if (!((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0))) return;

    setOffset((current) =>
      Math.max(-18, Math.min(18, current - event.deltaY * 0.16)),
    );
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setOffset(0), 110);
  };

  return (
    <div
      ref={container}
      className={`${className}${overflowing ? " has-overflow" : " no-overflow"}`}
      onWheel={handleWheel}
    >
      <motion.div
        ref={content}
        className="elastic-scroll-content"
        animate={{ y: reduceMotion ? 0 : offset }}
        transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.55 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
