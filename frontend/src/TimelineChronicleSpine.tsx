import { useLayoutEffect, useRef } from "react";
import type { TimelineEntry } from "./api";

export default function TimelineChronicleSpine({ events, colors }: {
  events: TimelineEntry[];
  colors: Map<string, string>;
}) {
  const spine = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const line = spine.current;
    const track = line?.parentElement;
    if (!line || !track) return;
    const colorsByEvent = new Map(events.map(({ id, entity_id }) => [id, colors.get(entity_id) || "var(--accent)"]));
    const anchors = [...track.querySelectorAll<HTMLElement>(".timeline-axis-mark")].filter(
      (mark) => colorsByEvent.has(mark.dataset.eventId ?? ""),
    );
    const dividers = [...track.querySelectorAll<HTMLElement>(".timeline-era-divider")];
    const topInTrack = (item: HTMLElement) => {
      let y = 0;
      for (let element: HTMLElement | null = item; element && element !== track; element = element.offsetParent as HTMLElement | null) {
        y += element.offsetTop;
      }
      return y;
    };
    const measure = () => {
      const tint = (color: string) => "color-mix(in oklch, " + color + " var(--timeline-spine-tint), white)";
      const stops = anchors.map((mark) => ({
        y: topInTrack(mark),
        color: tint(colorsByEvent.get(mark.dataset.eventId ?? "") ?? "var(--accent)"),
      })).sort((left, right) => left.y - right.y);
      const firstColor = stops[0]?.color;
      const lastColor = stops.at(-1)?.color;
      line.style.setProperty("--timeline-spine-colors", firstColor
        ? [firstColor + " 0px", ...stops.map(({ color, y }) => color + " " + y + "px"), lastColor + " 100%"].join(", ")
        : "var(--accent), transparent");
      if (!stops.length) return;
      let index = 0;
      for (const divider of dividers) {
        const y = topInTrack(divider) + divider.offsetHeight / 2;
        while (index < stops.length - 1 && stops[index].y < y) index++;
        const next = stops[index];
        const previous = stops[Math.max(0, index - 1)];
        const weight = previous.y === next.y ? 0 : Math.max(0, Math.min(1, (y - previous.y) / (next.y - previous.y)));
        divider.style.setProperty("--timeline-era-tone",
          "color-mix(in oklab, " + next.color + " " + weight * 100 + "%, " + previous.color + ")");
      }
    };

    const observer = new ResizeObserver(measure);
    observer.observe(track);
    for (const anchor of anchors) {
      const row = anchor.closest(".timeline-row-axis");
      if (row) observer.observe(row);
    }
    measure();
    return () => observer.disconnect();
  }, [events, colors]);

  return <div className="timeline-axis-spine" ref={spine} aria-hidden="true" />;
}
