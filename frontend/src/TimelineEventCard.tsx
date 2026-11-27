import { ChevronRight } from "lucide-react";
import { useRef, type CSSProperties, type MouseEvent } from "react";
import type { TimelineEntry } from "./api";
import { translate, type Language } from "./i18n";
import type { TimelineMode } from "./timelinePreferences";
import { formatWorldDate } from "./worldDate";

export default function TimelineEventCard({
  event, mode, era, language, typeName, color, motionEnabled, onDetails, onEntry, onContextMenu,
}: {
  event: TimelineEntry;
  mode: TimelineMode;
  era: string;
  language: Language;
  typeName: string;
  color: string;
  motionEnabled: boolean;
  onDetails: () => void;
  onEntry: () => void;
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const classic = mode === "list";
  const date = formatWorldDate(event, era, language);
  const title = event.label || event.date_kind;

  const tilt = (pointer: MouseEvent<HTMLElement>) => {
    if (classic || !motionEnabled || !surface.current) return;
    const bounds = pointer.currentTarget.getBoundingClientRect();
    const normalized = (distance: number, size: number) => Math.max(-1, Math.min(1, 2 * distance / size - 1));
    const nx = normalized(pointer.clientX - bounds.left, bounds.width);
    const ny = normalized(pointer.clientY - bounds.top, bounds.height);
    const style = surface.current.style;
    style.setProperty("--timeline-tilt-x", -ny * 6 + "deg");
    style.setProperty("--timeline-tilt-y", nx * 6 + "deg");
    style.setProperty("--timeline-glare-x", (1 + nx) * 50 + "%");
    style.setProperty("--timeline-glare-y", (1 + ny) * 50 + "%");
  };

  const resetTilt = () => {
    surface.current?.style.removeProperty("--timeline-tilt-x");
    surface.current?.style.removeProperty("--timeline-tilt-y");
  };

  const contents = (
    <>
      <button type="button" className="timeline-card-details" aria-label={title + " · " + date} onClick={onDetails} />
      <span className="timeline-card-date">{date}</span>
      <div className="timeline-card-copy">
        <strong>{title}</strong>
        {classic ? <small>{event.name} · {typeName}</small> : event.description?.trim() && <p>{event.description}</p>}
      </div>
      {classic && <ChevronRight size={15} className="timeline-card-chevron" />}
      <footer className="timeline-card-entries">
        <button type="button" className="timeline-entry-chip"
          title={translate(language, "打开关联词条") + " · " + event.name}
          onClick={(pointer) => {
            pointer.stopPropagation();
            onEntry();
          }}>
          <span aria-hidden="true" />{event.name}
        </button>
      </footer>
    </>
  );

  return (
    <article
      className={classic ? "timeline-card timeline-card-list" : "timeline-event-card"}
      style={{ "--timeline-color": color } as CSSProperties}
      onContextMenu={onContextMenu}
      onMouseMove={classic || !motionEnabled ? undefined : tilt}
      onMouseLeave={classic ? undefined : resetTilt}
    >
      {classic ? contents : (
        <div ref={surface} className={"timeline-card timeline-card-" + mode}>
          <span className="timeline-card-glare" aria-hidden="true" />
          {contents}
        </div>
      )}
    </article>
  );
}
