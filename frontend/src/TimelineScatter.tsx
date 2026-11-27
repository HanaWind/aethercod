import { animate } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { TimelineEntry } from "./api";
import { translate, type Language } from "./i18n";
import { formatWorldDate } from "./worldDate";

export type YearWindow = { start: number; end: number };
type BrushPart = "start" | "end" | "move";
type DatedEvent = TimelineEntry & { year: number };
type Drag = {
  id: number;
  x: number;
  left: number;
  pixels: number;
  part: BrushPart;
  selection: YearWindow;
  viewport: YearWindow;
  moved: boolean;
};

export function getTimelineDomain(events: TimelineEntry[]): YearWindow | null {
  let start = Infinity;
  let end = -Infinity;
  for (const { year } of events) {
    if (year === null) continue;
    start = Math.min(start, year);
    end = Math.max(end, year);
  }
  if (start === Infinity) return null;
  return start === end ? { start: start - 1, end: end + 1 } : { start, end };
}

export function constrainTimelineWindow(selection: YearWindow | null, viewport: YearWindow | null) {
  if (!selection || !viewport) return null;
  const start = Math.max(selection.start, viewport.start);
  const end = Math.min(selection.end, viewport.end);
  return start <= end ? { start, end } : null;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function constrainTimelineViewport(viewport: YearWindow | null, domain: YearWindow) {
  const availableSpan = domain.end - domain.start;
  if (!viewport || viewport.end <= domain.start || viewport.start >= domain.end) return domain;
  const span = clamp(viewport.end - viewport.start, Math.min(1, availableSpan), availableSpan);
  const start = clamp(viewport.start, domain.start, domain.end - span);
  return { start, end: start + span };
}

export default function TimelineScatter({
  events, names, colors, era, language, typeIds, domain, viewport, selection, motionEnabled, onChange, onZoom, onEvent,
}: {
  events: TimelineEntry[];
  names: Map<string, string>;
  colors: Map<string, string>;
  era: string;
  language: Language;
  typeIds: string[];
  domain: YearWindow;
  viewport: YearWindow;
  selection: YearWindow | null;
  motionEnabled: boolean;
  onZoom: (viewport: YearWindow | null) => void;
  onChange: (selection: YearWindow, viewport: YearWindow) => void;
  onEvent: (event: TimelineEntry) => void;
}) {
  const lanes = useMemo(() => {
    const rows = new Map<string, DatedEvent[]>(typeIds.map((id) => [id, []]));
    for (const event of events) {
      if (event.year === null) continue;
      const lane = rows.get(event.type_id) ?? [];
      lane.push({ ...event, year: event.year });
      rows.set(event.type_id, lane);
    }
    return [...rows].sort(([a], [b]) => (names.get(a) ?? a).localeCompare(names.get(b) ?? b, language));
  }, [events, language, names, typeIds]);

  const chart = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const displayedViewport = useRef(viewport);
  displayedViewport.current = viewport;
  const zoomAnimation = useRef<{ stop: () => void } | null>(null);
  const zoomTarget = useRef<YearWindow | null>(null);
  const drag = useRef<Drag | null>(null);
  const detachDrag = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tooltip, setTooltip] = useState<{ event: DatedEvent; x: number; y: number } | null>(null);
  const active = selection ?? viewport;
  const zoomed = viewport.start !== domain.start || viewport.end !== domain.end;
  const t = (value: string) => translate(language, value);
  const span = viewport.end - viewport.start;
  const percentage = (year: number) => (year - viewport.start) / span * 100;
  const windowText = (range: YearWindow) => Math.ceil(range.start) + " – " + Math.floor(range.end);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, span / 7)));
  const tickStep = ([1, 2, 5, 10].find((step) => step * magnitude >= span / 7) ?? 10) * magnitude;
  const ticks = [Math.ceil(viewport.start)];
  for (let year = Math.ceil(viewport.start / tickStep) * tickStep; year < viewport.end; year += tickStep) {
    if (year > ticks[0] && year < Math.floor(viewport.end) && percentage(year) > 12 && percentage(year) < 88) ticks.push(year);
  }
  if (Math.floor(viewport.end) > ticks[0]) ticks.push(Math.floor(viewport.end));

  const stopZoom = () => {
    zoomAnimation.current?.stop();
    zoomAnimation.current = null;
    zoomTarget.current = null;
  };

  useEffect(() => {
    const element = chart.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const bounds = plot.current?.getBoundingClientRect();
      if (!bounds?.width || !event.deltaY || drag.current) return;
      const cursor = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
      const from = displayedViewport.current;
      const current = zoomTarget.current ?? from;
      const span = current.end - current.start;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
      const fullSpan = domain.end - domain.start;
      const nextSpan = clamp(span * Math.exp(clamp(event.deltaY * unit * 0.0025, -1, 1)), 1, fullSpan);
      if (nextSpan === span) return;
      const anchor = from.start + cursor * (from.end - from.start);
      const start = clamp(anchor - cursor * nextSpan, domain.start, domain.end - nextSpan);
      const target = nextSpan === fullSpan ? domain : { start, end: start + nextSpan };
      setTooltip(null);
      stopZoom();
      if (!motionEnabled) {
        onZoom(target);
        return;
      }
      zoomTarget.current = target;
      zoomAnimation.current = animate(0, 1, {
        duration: 0.18,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (progress) => onZoom({
          start: from.start + (target.start - from.start) * progress,
          end: from.end + (target.end - from.end) * progress,
        }),
        onComplete: () => {
          zoomTarget.current = null;
          zoomAnimation.current = null;
          onZoom(target);
        },
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
      stopZoom();
    };
  }, [domain, motionEnabled, onZoom]);

  useEffect(() => () => detachDrag.current?.(), []);

  const change = (part: BrushPart, origin: YearWindow, view: YearWindow, delta: number) => {
    if (part === "move") {
      const width = origin.end - origin.start;
      const start = clamp(origin.start + Math.round(delta), domain.start, domain.end - width);
      const end = Math.min(start + width, domain.end);
      const shift = start < view.start ? start - view.start : Math.max(0, end - view.end);
      const nextView = constrainTimelineViewport({ start: view.start + shift, end: view.end + shift }, domain);
      onChange({ start, end }, nextView);
      return;
    }
    const next = part === "start"
      ? { ...origin, start: clamp(Math.round(origin.start + delta), domain.start, origin.end) }
      : { ...origin, end: clamp(Math.round(origin.end + delta), origin.start, domain.end) };
    onChange(next, { start: Math.min(view.start, next.start), end: Math.max(view.end, next.end) });
  };

  const jumpToDecade = (x: number) => {
    const bounds = plot.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    const year = clamp(Math.round(viewport.start + (x - bounds.left) / bounds.width * span),
      Math.ceil(viewport.start), Math.floor(viewport.end));
    const decade = Math.floor(year / 10) * 10;
    onChange({ start: Math.max(decade, viewport.start), end: Math.min(decade + 9, viewport.end) }, viewport);
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>, part: BrushPart) => {
    const bounds = plot.current?.getBoundingClientRect();
    if (event.button !== 0 || !bounds?.width || drag.current) return;
    stopZoom();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = event.currentTarget;
    const current: Drag = { id: event.pointerId, x: event.clientX, left: bounds.left, pixels: bounds.width,
      part, selection: active, viewport, moved: false };
    drag.current = current;
    setTooltip(null);
    setDragging(true);

    const yearsPerPixel = (current.viewport.end - current.viewport.start) / current.pixels;
    const minDelta = part === "end" ? active.start - active.end : domain.start - active.start;
    const maxDelta = part === "start" ? active.end - active.start : domain.end - active.end;
    let edgeFrame = 0;
    let edgeOffset = 0;
    let pointerDelta = 0;
    let overflow = 0;
    const advance = (previous: number, now: number) => {
      const delta = pointerDelta + edgeOffset;
      const boundary = overflow < 0 ? minDelta : maxDelta;
      const speed = Math.sign(overflow) * Math.min(1, Math.abs(overflow) / 45) * yearsPerPixel * 0.65;
      const step = Math.sign(speed) * Math.min(Math.abs(boundary - delta), Math.abs(speed) * clamp(now - previous, 0, 32));
      edgeOffset += step;
      change(part, current.selection, current.viewport, pointerDelta + edgeOffset);
      edgeFrame = overflow !== 0 && (overflow < 0 ? delta + step > minDelta : delta + step < maxDelta)
        ? window.requestAnimationFrame((time) => advance(now, time)) : 0;
    };
    const move = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== current.id) return;
      const dx = pointer.clientX - current.x;
      if (!current.moved && Math.abs(dx) < 4) return;
      current.moved = true;
      // Keep the original scale throughout the gesture so expanding the view does not amplify the next move.
      pointerDelta = dx * yearsPerPixel;
      const ratio = (pointer.clientX - current.left) / current.pixels;
      overflow = (ratio - clamp(ratio, 0, 1)) * current.pixels;
      const delta = pointerDelta + edgeOffset;
      change(current.part, current.selection, current.viewport, delta);
      if (overflow < 0 ? delta > minDelta : overflow > 0 && delta < maxDelta) {
        if (!edgeFrame) {
          const startedAt = performance.now();
          edgeFrame = window.requestAnimationFrame((time) => advance(startedAt, time));
        }
      } else {
        window.cancelAnimationFrame(edgeFrame);
        edgeFrame = 0;
      }
    };
    const finish = (pointer?: globalThis.PointerEvent) => {
      if (pointer && pointer.pointerId !== current.id) return;
      detachDrag.current?.();
      setDragging(false);
      if (pointer?.type === "pointerup" && current.part === "move" && !current.moved) jumpToDecade(pointer.clientX);
    };
    const blur = () => finish();
    detachDrag.current = () => {
      window.cancelAnimationFrame(edgeFrame);
      drag.current = null;
      detachDrag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", blur);
      target.removeEventListener("lostpointercapture", finish);
      if (target.hasPointerCapture(current.id)) target.releasePointerCapture(current.id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", blur);
    target.addEventListener("lostpointercapture", finish);
  };

  const handleKeyboard = (event: KeyboardEvent, part: BrushPart) => {
    const increments: Record<string, number> = {
      ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1,
      Home: domain.start - domain.end, End: domain.end - domain.start,
    };
    const delta = increments[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    stopZoom();
    change(part, active, viewport, delta);
  };

  const showDotTooltip = (event: DatedEvent, target: HTMLButtonElement) => {
    const bounds = target.getBoundingClientRect();
    setTooltip({
      event,
      x: clamp(bounds.left + bounds.width / 2, 102, window.innerWidth - 102),
      y: bounds.top,
    });
  };
  const shell = plot.current?.closest(".app-shell");

  return (
    <section className="timeline-scatter" aria-label={t("散点概览")}
      style={{ "--timeline-lane-count": Math.max(1, lanes.length) } as CSSProperties}>
      <header className="timeline-scatter-header">
        <span>{era && <strong>{era}</strong>} {t("时间窗口")} <b>{windowText(active)}</b></span>
        <button className="secondary-button" type="button" disabled={!selection && !zoomed} onClick={() => {
          stopZoom();
          setTooltip(null);
          onZoom(null);
        }}>
          <RotateCcw size={13} />{t("全部年份")}
        </button>
      </header>
      <div className="timeline-scatter-chart-area" ref={chart}>
        <div className="timeline-scatter-lanes">
          {lanes.map(([typeId]) => (
            <div className="timeline-scatter-lane" key={typeId} title={names.get(typeId)}>{names.get(typeId) ?? t("词条")}</div>
          ))}
        </div>
        <div className="timeline-scatter-chart">
          <div className="timeline-scatter-ruler" aria-hidden="true">
            {ticks.map((year) => <span key={year} style={{ left: percentage(year) + "%" }}>{year}</span>)}
          </div>
          <div ref={plot} className="timeline-scatter-plot">
            <button className="timeline-scatter-background" type="button" tabIndex={-1}
              aria-label={t("按年代跳转")} onClick={(event) => jumpToDecade(event.clientX)} />
            {ticks.map((year) => <div key={year} className="timeline-scatter-tick" style={{ left: percentage(year) + "%" }} />)}
            <div className="timeline-scatter-brush" data-dragging={dragging}
              style={{ left: percentage(active.start) + "%", width: percentage(active.end) - percentage(active.start) + "%" }}>
              <div className="timeline-scatter-brush-body" role="slider" tabIndex={0} aria-label={t("平移时间窗口")}
                aria-valuemin={domain.start} aria-valuemax={domain.end - (active.end - active.start)}
                aria-valuenow={active.start} aria-valuetext={windowText(active)}
                onPointerDown={(event) => startDrag(event, "move")} onKeyDown={(event) => handleKeyboard(event, "move")} />
              {(["start", "end"] as const).map((part) => (
                <div key={part} className={"timeline-scatter-handle " + part} role="slider" tabIndex={0}
                  aria-label={t(part === "start" ? "起始年份" : "终止年份")}
                  aria-valuemin={part === "start" ? domain.start : active.start}
                  aria-valuemax={part === "start" ? active.end : domain.end}
                  aria-valuenow={active[part]}
                  onPointerDown={(event) => startDrag(event, part)} onKeyDown={(event) => handleKeyboard(event, part)} />
              ))}
            </div>
            {lanes.map(([typeId, entries]) => {
              const counts = new Map<number, number>();
              return (
                <div className="timeline-scatter-row" key={typeId}>
                  {entries.map((event) => {
                    if (event.year < viewport.start || event.year > viewport.end) return null;
                    const occurrence = counts.get(event.year) ?? 0;
                    counts.set(event.year, occurrence + 1);
                    const offset = occurrence ? (occurrence % 2 ? -1 : 1) * (9 + Math.floor((occurrence - 1) / 2) % 3 * 8) : 0;
                    const selected = event.year >= active.start && event.year <= active.end;
                    return (
                      <button type="button" key={event.id} className="timeline-scatter-dot" data-selected={selected}
                        aria-label={(event.label || event.date_kind) + " · " + formatWorldDate(event, era, language)}
                        style={{ left: percentage(event.year) + "%", top: (50 + offset) + "%",
                          "--timeline-color": colors.get(event.entity_id) ?? "var(--accent)" } as CSSProperties}
                        onMouseEnter={(pointer) => showDotTooltip(event, pointer.currentTarget)}
                        onMouseLeave={() => setTooltip(null)}
                        onFocus={(focus) => showDotTooltip(event, focus.currentTarget)}
                        onBlur={() => setTooltip(null)}
                        onClick={() => {
                          setTooltip(null);
                          onEvent(event);
                        }} />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {shell && tooltip && createPortal(
        <div className="timeline-scatter-tooltip glass-menu" aria-hidden="true"
          style={{ left: tooltip.x, top: tooltip.y }}>
          <strong>{tooltip.event.label || tooltip.event.date_kind}</strong>
          <span>{formatWorldDate(tooltip.event, era, language)}</span>
        </div>,
        shell,
      )}
    </section>
  );
}
