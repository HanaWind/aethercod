import { Columns2, List, Plus, ScatterChart, X } from "lucide-react";
import { useState } from "react";
import { translate, type Language } from "./i18n";
import { parseTimelineYear, readTimelineEras, timelineModes, writeTimelineEras, type TimelineMode } from "./timelinePreferences";

const icons = { list: List, axis: Columns2, scatter: ScatterChart };

export function TimelineModeControl({ mode, onChange, language, label }: {
  mode: TimelineMode;
  onChange: (mode: TimelineMode) => void;
  language: Language;
  label: string;
}) {
  return (
    <div className="timeline-mode-control" role="group" aria-label={label}>
      {timelineModes.map(({ value, label: name }) => {
        const Icon = icons[value];
        const title = translate(language, name);
        return (
          <button key={value} type="button" aria-pressed={mode === value} aria-label={title}
            title={title} onClick={() => onChange(value)}>
            <Icon size={14} aria-hidden="true" />
            <span>{title}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TimelineEraPreferences({ path, language }: { path: string; language: Language }) {
  const [eras, setEras] = useState(() => readTimelineEras(path));
  const [year, setYear] = useState("");
  const [name, setName] = useState("");
  const parsed = parseTimelineYear(year);
  const valid = parsed !== null && Number.isSafeInteger(parsed);
  const t = (text: string) => translate(language, text);

  const update = (next: typeof eras) => {
    writeTimelineEras(path, next);
    setEras(next);
  };

  return (
    <div className="timeline-era-preferences">
      <h3>{t("纪元分界")}</h3>
      <div className="timeline-era-inputs">
        <input aria-label={t("纪元起始年份")} placeholder={t("纪元起始年份")} value={year}
          aria-invalid={Boolean(year.trim()) && !valid} onChange={(event) => setYear(event.target.value)} />
        <input aria-label={t("纪元名称")} placeholder={t("纪元名称")} value={name}
          onChange={(event) => setName(event.target.value)} />
        <button className="secondary-button" type="button" disabled={!valid || !name.trim()} onClick={() => {
          if (!valid || parsed === null || !name.trim()) return;
          update([...eras.filter((era) => era.year !== parsed), { year: parsed, name: name.trim() }]
            .sort((left, right) => left.year - right.year));
          setYear("");
          setName("");
        }}><Plus size={14} />{t("添加分界")}</button>
      </div>
      {eras.length > 0 && (
        <ul className="timeline-era-list">
          {eras.map((era) => (
            <li key={era.year}>
              <span>{era.year} · {era.name}</span>
              <button className="icon-button compact" type="button"
                title={t("移除分界")} aria-label={`${t("移除分界")} ${era.name}`}
                onClick={() => update(eras.filter(({ year }) => year !== era.year))}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
