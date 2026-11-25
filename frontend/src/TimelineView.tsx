import { formatWorldDate } from "./worldDate";
import Dropdown from "./Dropdown";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronRight, ExternalLink, Filter, Network, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { EntityType, TimelineEntry } from "./api";
import ElasticScroll from "./ElasticScroll";
import { glassFade, glassSlide } from "./glassMotion";
import { displayTypeName, translate, type Language } from "./i18n";

const filterTransition = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const;

function parseYear(value: string) {
  if (!value.trim()) return null;
  if (!/^[+-]?\d+$/.test(value.trim())) return Number.NaN;
  const year = Number(value);
  return Number.isSafeInteger(year) ? year : Number.NaN;
}

export default function TimelineView({
  events,
  types,
  era,
  language,
  onSelect,
  onRelatedGraph,
}: {
  events: TimelineEntry[];
  types: EntityType[];
  era: string;
  language: Language;
  onSelect: (entityId: string) => void;
  onRelatedGraph: (entityId: string) => void;
}) {
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<TimelineEntry | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entityId: string } | null>(null);
  const startYear = parseYear(start);
  const endYear = parseYear(end);
  const invalidStart = Number.isNaN(startYear);
  const invalidEnd = Number.isNaN(endYear);
  const reversed = startYear !== null && endYear !== null && startYear > endYear;
  const yearFilterError = invalidStart || invalidEnd
    ? "请输入有效的整数年份。"
    : reversed ? "起始年份不能晚于终止年份。" : "";
  const hasYearFilter = startYear !== null || endYear !== null;
  const filtered = events.filter((event) =>
    (!typeId || event.type_id === typeId) &&
    (!hasYearFilter || (event.year !== null && !yearFilterError &&
      (startYear === null || event.year >= startYear) &&
      (endYear === null || event.year <= endYear))),
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
    <div className="timeline-page">
      <header className="view-header">
        <div>
          <span className="section-kicker">{era}{translate(language, "纪年")}</span>
          <h1>{translate(language, "时间线")}</h1>
        </div>
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
      <ElasticScroll className="timeline-page-scroll">
        <div className="timeline-track">
          <AnimatePresence initial={false}>
            {filtered.map((event) => (
              <motion.div
                className="timeline-motion-row"
                key={event.id}
                layout="position"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0, pointerEvents: "none" }}
                transition={filterTransition}
              >
                <button
                  className="timeline-card"
                  onClick={() => setSelectedEvent(event)}
                  onContextMenu={(pointerEvent) => {
                    pointerEvent.preventDefault();
                    setContextMenu({
                      x: Math.max(8, Math.min(pointerEvent.clientX, window.innerWidth - 210)),
                      y: Math.max(8, Math.min(pointerEvent.clientY, window.innerHeight - 80)),
                      entityId: event.entity_id,
                    });
                  }}
                >
                  <span className="timeline-card-node" />
                  <span className="timeline-card-date">
                    {formatWorldDate(event, era)}
                  </span>
                  <span className="timeline-card-copy">
                    <strong>{event.label || event.date_kind}</strong>
                    <small>
                      {event.name} ·{" "}
                      {(() => {
                        const type = types.find((item) => item.id === event.type_id);
                        return type ? displayTypeName(language, type) : translate(language, "词条");
                      })()}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <AnimatePresence initial={false}>
          {!filtered.length && !yearFilterError && (
            <motion.div
              className="empty-view timeline-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={filterTransition}
            >
              <CalendarDays size={22} />
              <strong>{translate(language, events.length ? "没有符合筛选条件的事件" : "时间线尚无纪年节点")}</strong>
            </motion.div>
          )}
        </AnimatePresence>
      </ElasticScroll>
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            className="context-menu glass-menu"
            role="menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            {...glassSlide(4)}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
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
      <AnimatePresence>
        {selectedEvent && (
          <motion.div
            className="modal-scrim timeline-event-scrim"
            {...glassFade}
            transition={{ duration: 0.1, ease: "easeOut" }}
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
              <div className="timeline-event-glass glass-menu" aria-hidden="true" />
              <motion.div className="timeline-event-content"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12, ease: "easeOut" }}>
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
                {formatWorldDate(selectedEvent, era)}
                <span>·</span>
                <span>{selectedEvent.name}</span>
                <span>·</span>
                <span>
                  {(() => {
                    const type = types.find((item) => item.id === selectedEvent.type_id);
                    return type ? displayTypeName(language, type) : translate(language, "词条");
                  })()}
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
    </div>
  );
}
