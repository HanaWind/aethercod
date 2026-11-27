import { Columns2, List, Plus, ScatterChart, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { translate, type Language } from "./i18n";
import { parseTimelineYear, readTimelineEras, timelineModes, writeTimelineEras, type TimelineMode } from "./timelinePreferences";

const icons = { list: List, axis: Columns2, scatter: ScatterChart };

export function TimelineModeControl({ mode, onChange, language, label }: {
  mode: TimelineMode;
  onChange: (mode: TimelineMode) => void;
  language: Language;
  label: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLButtonElement>());
  const [pill, setPill] = useState({ x: 0, width: 0, ready: false });

  useLayoutEffect(() => {
    const element = items.current.get(mode);
    const container = root.current;
    if (!element || !container) return;
    const measure = () => setPill({
      x: element.offsetLeft,
      width: element.offsetWidth,
      ready: true,
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const button of items.current.values()) observer.observe(button);
    return () => observer.disconnect();
  }, [language, mode]);

  return (
    <div ref={root} className="timeline-mode-control" role="group" aria-label={label}>
      <span className="timeline-mode-pill" aria-hidden="true"
        style={{ transform: `translateX(${pill.x}px)`, width: pill.width, opacity: pill.ready ? 1 : 0 }} />
      {timelineModes.map(({ value, label: name }) => {
        const Icon = icons[value];
        const title = translate(language, name);
        return (
          <button ref={(element) => {
            if (element) items.current.set(value, element);
            else items.current.delete(value);
          }} key={value} type="button" aria-pressed={mode === value} aria-label={title}
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
