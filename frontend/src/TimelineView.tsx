import { formatWorldDate } from "./worldDate";
import Dropdown from "./Dropdown";
import { CalendarDays, ChevronRight, Filter } from "lucide-react";
import { useState } from "react";
import type { EntityType, TimelineEntry } from "./api";

export default function TimelineView({
  events,
  types,
  era,
  onSelect,
}: {
  events: TimelineEntry[];
  types: EntityType[];
  era: string;
  onSelect: (entityId: string) => void;
}) {
  const [typeId, setTypeId] = useState("");
  const filtered = events.filter(
    (event) => !typeId || event.type_id === typeId,
  );

  return (
    <div className="timeline-page">
      <header className="view-header">
        <div>
          <span className="section-kicker">{era}纪年</span>
          <h1>时间线</h1>
        </div>
        <div className="view-filter">
          <Filter size={14} />
          <Dropdown
            label="筛选时间线类型"
            value={typeId}
            onChange={setTypeId}
            options={[
              { value: "", label: "全部类型" },
              ...types.map((type) => ({ value: type.id, label: type.name })),
            ]}
          />
        </div>
      </header>
      <div className="timeline-page-scroll">
        {filtered.length ? (
          <div className="timeline-track">
            {filtered.map((event) => (
              <button
                className="timeline-card"
                key={event.id}
                onClick={() => onSelect(event.entity_id)}
              >
                <span className="timeline-card-node" />
                <span className="timeline-card-date">
                  {formatWorldDate(event, era)}
                </span>
                <span className="timeline-card-copy">
                  <strong>{event.label || event.date_kind}</strong>
                  <small>
                    {event.name} ·{" "}
                    {types.find((type) => type.id === event.type_id)?.name ??
                      "词条"}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-view">
            <CalendarDays size={22} />
            <strong>时间线尚无纪年节点</strong>
            <span>在词条中添加日期后，事件会显示在此处。</span>
          </div>
        )}
      </div>
    </div>
  );
}
