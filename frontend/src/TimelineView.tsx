import { formatWorldDate } from "./worldDate";
import Dropdown from "./Dropdown";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ExternalLink, Filter, Network, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { EntitySummary, EntityType, TimelineEntry } from "./api";
import ElasticScroll from "./ElasticScroll";
import { glassFade, glassSlide } from "./glassMotion";
import { displayTypeName, translate, type Language } from "./i18n";
import { TimelineModeControl } from "./TimelineModeControl";
import TimelineEventCard from "./TimelineEventCard";
import TimelineChronicleSpine from "./TimelineChronicleSpine";
import { parseTimelineYear, readTimelineEras, type TimelineMode } from "./timelinePreferences";
import TimelineScatter, { constrainTimelineViewport, constrainTimelineWindow, getTimelineDomain, type YearWindow } from "./TimelineScatter";

const transition = { duration: 0.19, ease: [0.22, 1, 0.36, 1] } as const;
const gapThreshold = 20;

export default function TimelineView({
  events,
  types,
  entities,
  era,
  projectPath,
  language,
  mode,
  onModeChange,
  motionEnabled,
  onSelect,
  onRelatedGraph,
}: {
  events: TimelineEntry[];
  types: EntityType[];
  entities: EntitySummary[];
  era: string;
  projectPath: string;
  language: Language;
  mode: TimelineMode;
  onModeChange: (mode: TimelineMode) => void;
  motionEnabled: boolean;
  onSelect: (entityId: string) => void;
  onRelatedGraph: (entityId: string) => void;
}) {
  const [typeId, setTypeId] = useState("");
  const page = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [scatter, setScatter] = useState<{ selection: YearWindow | null; viewport: YearWindow | null }>({
    selection: null,
    viewport: null,
  });
  const [selectedEvent, setSelectedEvent] = useState<TimelineEntry | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entityId: string } | null>(null);
  const startYear = parseTimelineYear(start);
  const endYear = parseTimelineYear(end);
  const invalidStart = Number.isNaN(startYear);
  const invalidEnd = Number.isNaN(endYear);
  const reversed = startYear !== null && endYear !== null && startYear > endYear;
  const yearFilterError = invalidStart || invalidEnd
    ? "请输入有效的整数年份。"
    : reversed ? "起始年份不能晚于终止年份。" : "";
  const hasYearFilter = startYear !== null || endYear !== null;
  const filtered = useMemo(() => events.filter((event) =>
    (!typeId || event.type_id === typeId) &&
    (!hasYearFilter || (event.year !== null && !yearFilterError &&
      (startYear === null || event.year >= startYear) &&
      (endYear === null || event.year <= endYear))),
  ), [endYear, events, hasYearFilter, startYear, typeId, yearFilterError]);
  const names = useMemo(() => new Map(types.map((type) => [type.id, displayTypeName(language, type)])), [language, types]);
  const scatterTypes = useMemo(() => types.filter((type) => !type.hidden && (!typeId || type.id === typeId)).map(({ id }) => id),
    [typeId, types]);
  const colors = useMemo(() => new Map(entities.map(({ id, color }) => [id, color])), [entities]);
  const eras = useMemo(() => readTimelineEras(projectPath), [projectPath]);
  const domain = useMemo(() => getTimelineDomain(filtered), [filtered]);
  const viewport = useMemo(() => domain && constrainTimelineViewport(scatter.viewport, domain), [domain, scatter.viewport]);
  const selection = useMemo(() => constrainTimelineWindow(scatter.selection, viewport), [scatter.selection, viewport]);
  const zoomed = viewport !== null && domain !== null && (viewport.start !== domain.start || viewport.end !== domain.end);
  const visibleRange = selection ?? (zoomed ? viewport : null);
  const displayed = useMemo(() => mode === "scatter" && visibleRange
    ? filtered.filter(({ year }) => year !== null && year >= visibleRange.start && year <= visibleRange.end)
    : filtered, [filtered, mode, visibleRange]);
  const changeScatterZoom = useCallback((next: YearWindow | null) => {
    setScatter((current) => ({
      viewport: next,
      selection: constrainTimelineWindow(current.selection, next),
    }));
  }, []);
  const t = (value: string) => translate(language, value);
  const animation = motionEnabled ? transition : { duration: 0 };
  const modalHost = page.current?.closest(".app-shell");

  const empty = !displayed.length && !yearFilterError && (
    <div className="empty-view timeline-empty">
      <CalendarDays size={22} />
      <strong>{t(events.length ? "没有符合筛选条件的事件" : "时间线尚无纪年节点")}</strong>
    </div>
  );

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [contextMenu]);

  return (
    <div className="timeline-page" ref={page}>
      <header className="view-header timeline-view-header">
        <div>
          <span className="section-kicker">{era}{translate(language, "纪年")}</span>
          <h1>{translate(language, "时间线")}</h1>
        </div>
        <div className="timeline-header-actions">
          <TimelineModeControl mode={mode} onChange={onModeChange} language={language} label={t("时间线展示方案")} />
          <div className="view-filter">
          <Filter size={14} />
          <Dropdown
            label={language === "en" ? "Filter timeline by type" : "筛选时间线类型"}
            value={typeId}
            onChange={setTypeId}
            options={[
              { value: "", label: translate(language, "全部类型") },
              ...types.map((type) => ({ value: type.id, label: displayTypeName(language, type) })),
            ]}
          />
          </div>
        </div>
      </header>
      <div className="timeline-year-filters" role="group" aria-label={translate(language, "年份筛选")}>
        <label>
              {translate(language, "起始年份")}
          <input
            value={start}
            onChange={(event) => setStart(event.target.value)}
            aria-invalid={invalidStart || reversed}
            aria-describedby={yearFilterError ? "timeline-year-error" : undefined}
          />
        </label>
        <label>
              {translate(language, "终止年份")}
          <input
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            aria-invalid={invalidEnd || reversed}
            aria-describedby={yearFilterError ? "timeline-year-error" : undefined}
          />
        </label>
        <button
          type="button"
          className="icon-button"
              title={translate(language, "清空年份筛选")}
              aria-label={translate(language, "清空年份筛选")}
          disabled={!start && !end}
          onClick={() => {
            setStart("");
            setEnd("");
          }}
        >
          <X size={15} />
        </button>
        {yearFilterError && <span id="timeline-year-error" role="status">{translate(language, yearFilterError)}</span>}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div className="timeline-view-panel" key={mode}
          initial={motionEnabled ? { opacity: 0 } : false} animate={{ opacity: 1 }}
          exit={{ opacity: 0 }} transition={animation}>
          {mode === "scatter" && domain && viewport && (
            <TimelineScatter events={filtered} names={names} colors={colors} era={era} language={language}
              typeIds={scatterTypes} domain={domain} viewport={viewport} selection={selection} motionEnabled={motionEnabled}
              onZoom={changeScatterZoom}
              onChange={(selection, viewport) => setScatter({ selection, viewport })}
              onEvent={setSelectedEvent} />
          )}
          <ElasticScroll className={"timeline-page-scroll timeline-scroll-" + mode}>
            <div className={mode === "list" ? "timeline-track" : "timeline-track-" + mode}>
              {mode === "axis" && <TimelineChronicleSpine events={displayed} colors={colors} />}
              <AnimatePresence initial={false} mode={mode === "scatter" ? "popLayout" : "sync"}>
                {displayed.map((event, index) => {
                  const previous = displayed[index - 1]?.year;
                  const year = event.year;
                  const gap = mode === "axis" && previous != null && year !== null ? Math.max(0, year - previous) : 0;
                  const boundaries = mode === "axis" && year !== null ? eras.filter((boundary) => boundary.year <= year) : [];
                  const shownBoundaries = previous == null ? boundaries.slice(-1) : boundaries.filter((boundary) => boundary.year > previous);
                  if (mode === "axis" && previous != null && previous < 0 && year !== null &&
                      year >= 0 && !shownBoundaries.some((boundary) => boundary.year === 0)) {
                    shownBoundaries.push({ year: 0, name: era || t("纪年起点") });
                    shownBoundaries.sort((left, right) => left.year - right.year);
                  }

                  const color = colors.get(event.entity_id) ?? "var(--accent)";
                  const card = (
                    <TimelineEventCard event={event} mode={mode} era={era} language={language}
                      typeName={names.get(event.type_id) ?? t("词条")}
                      color={color} motionEnabled={motionEnabled}
                      onDetails={() => setSelectedEvent(event)} onEntry={() => onSelect(event.entity_id)}
                      onContextMenu={(pointer) => {
                        pointer.preventDefault();
                        setContextMenu({
                          x: Math.max(8, Math.min(pointer.clientX, window.innerWidth - 210)),
                          y: Math.max(8, Math.min(pointer.clientY, window.innerHeight - 80)),
                          entityId: event.entity_id,
                        });
                      }} />
                  );

                  return (
                    <motion.div
                      className={mode === "list" ? "timeline-motion-row" : "timeline-row-" + mode}
                      data-side={mode === "axis" ? (index % 2 ? "right" : "left") : undefined}
                      key={event.id}
                      layout={motionEnabled ? "position" : false}
                      initial={motionEnabled ? (mode === "scatter" ? { opacity: 0 } : { height: 0, opacity: 0 }) : false}
                      animate={mode === "scatter" ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                      exit={mode === "scatter" ? { opacity: 0, pointerEvents: "none" } : { height: 0, opacity: 0, pointerEvents: "none" }}
                      transition={animation}
                    >
                      {mode === "list" && (
                        <span className="timeline-card-node" aria-hidden="true"
                          style={{ "--timeline-color": color } as CSSProperties} />
                      )}
                      {mode === "axis" && (
                        <>
                          <div className="timeline-axis-gap" style={{ height: Math.min(176, gap * 0.9) + (gap >= gapThreshold ? 28 : 0) }}>
                            {gap >= gapThreshold && (
                              <span className="timeline-gap-badge" title={era}>
                                {t("+{count} 年").replace("{count}", () => gap.toLocaleString(language))}
                              </span>
                            )}
                          </div>
                          {shownBoundaries.map((boundary) => (
                            <div className="timeline-era-divider" key={boundary.year}>
                              <div className="timeline-era-banner">
                                <span>{boundary.year}</span>{boundary.name}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {mode === "axis" ? (
                        <div className="timeline-axis-event" style={{ "--timeline-color": color } as CSSProperties}>
                          <div className="timeline-axis-mark" data-event-id={event.id} aria-hidden="true">
                            <span />
                          </div>
                          {card}
                        </div>
                      ) : card}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            {empty}
          </ElasticScroll>
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            className="context-menu glass-menu"
            role="menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            {...glassSlide(4)}
            transition={animation}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              role="menuitem"
              onClick={() => {
                const { entityId } = contextMenu;
                setContextMenu(null);
                onRelatedGraph(entityId);
              }}
            >
              <Network size={14} />
              {translate(language, "关联图谱")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {modalHost && createPortal(<>
      <AnimatePresence>
        {selectedEvent && (
          <motion.div
            className="modal-scrim timeline-event-scrim timeline-event-overlay"
            {...glassFade}
            transition={{ duration: motionEnabled ? 0.1 : 0, ease: "easeOut" }}
            onMouseDown={() => setSelectedEvent(null)}
          />
        )}
      </AnimatePresence>
      {selectedEvent && (
        <div className="modal-scrim timeline-event-scrim timeline-event-shell">
          <section
              className="timeline-event-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={selectedEvent.label || translate(language, "时间线事件详情")}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSelectedEvent(null);
              }}
            >
              <div className="timeline-event-glass" aria-hidden="true" />
              <motion.div className="timeline-event-content"
                initial={motionEnabled ? { opacity: 0, y: 4 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: motionEnabled ? 0.12 : 0, ease: "easeOut" }}>
              <header>
                <div>
                  <span className="section-kicker">{era}{translate(language, "纪年")} · {translate(language, "事件详情")}</span>
                  <h2>{selectedEvent.label || selectedEvent.date_kind}</h2>
                </div>
                <button
                  className="icon-button"
                  autoFocus
                  title={translate(language, "关闭")}
                  onClick={() => setSelectedEvent(null)}
                >
                  <X size={15} />
                </button>
              </header>
              <div className="timeline-event-meta">
                <CalendarDays size={14} />
                {formatWorldDate(selectedEvent, era, language)}
                <span>·</span>
                <span>{selectedEvent.name}</span>
                <span>·</span>
                <span>
                  {names.get(selectedEvent.type_id) ?? t("词条")}
                </span>
              </div>
              <p className="timeline-event-description">
                {selectedEvent.description?.trim() || translate(language, "暂无事件说明")}
              </p>
              <footer>
                <button
                  className="primary-button"
                  onClick={() => {
                    const entityId = selectedEvent.entity_id;
                    setSelectedEvent(null);
                    onSelect(entityId);
                  }}
                >
                  <ExternalLink size={14} />
                  {translate(language, "打开关联词条")}
                </button>
              </footer>
              </motion.div>
          </section>
        </div>
      )}
      </>, modalHost)}
    </div>
  );
}
