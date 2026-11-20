import { motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode, type WheelEvent } from "react";

export default function ElasticScroll({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => window.clearTimeout(resetTimer.current),
    [],
  );

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
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
    <div className={className} onWheel={handleWheel}>
      <motion.div
        className="elastic-scroll-content"
        animate={{ y: offset }}
        transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.55 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
