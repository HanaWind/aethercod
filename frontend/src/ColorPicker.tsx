import { Check, ChevronDown, Palette } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { glassSlide } from "./glassMotion";
import { translate, type Language } from "./i18n";

const PRESETS = [
  "#8B5CF6",
  "#6366F1",
  "#3B82F6",
  "#06B6D4",
  "#14B8A6",
  "#22C55E",
  "#84CC16",
  "#EAB308",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#A855F7",
];

export default function ColorPicker({
  value,
  disabled,
  language,
  onChange,
}: {
  value: string;
  disabled: boolean;
  language: Language;
  onChange: (value: string) => void;
}) {
  const [position, setPosition] = useState<{
    right: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hexInput, setHexInput] = useState<string | null>(null);
  const openedColor = useRef(value);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const selection = /^#[0-9a-f]{6}$/i.test(value) ? value : "#7C3AED";
  const rgb = [1, 3, 5].map((index) =>
    parseInt(selection.slice(index, index + 2), 16),
  );
  const [hue, saturation, brightness] = toHsv(rgb);
  const angle = (hue * Math.PI) / 180;
  const open = Boolean(position && !disabled);
  const t = (key: string) => translate(language, key);
  const hex = (hexInput ?? selection).trim().replace(/^#/, "");
  const validHex = /^[0-9a-f]{6}$/i.test(hex);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !panel.current?.contains(event.target)
      )
        setPosition(null);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPosition(null);
        trigger.current?.focus();
      }
    };
    const closeOnResize = () => setPosition(null);
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeWithEscape);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeWithEscape);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setPosition(null);
  }, [disabled]);

  const toggle = () => {
    if (position) {
      setPosition(null);
      return;
    }
    const bounds = trigger.current?.getBoundingClientRect();
    if (!bounds) return;
    setExpanded(false);
    setHexInput(null);
    openedColor.current = selection;
    const below = window.innerHeight - bounds.bottom;
    const above = below < 420 && bounds.top > below;
    setPosition({
      right: Math.max(8, window.innerWidth - bounds.right),
      maxHeight: (above ? bounds.top : below) - 15,
      ...(above
        ? { bottom: window.innerHeight - bounds.top + 7 }
        : { top: bounds.bottom + 7 }),
    });
  };

  const pick = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - bounds.left) / bounds.width - 0.5;
    const dy = (event.clientY - bounds.top) / bounds.height - 0.5;
    const hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    setHexInput(null);
    onChange(
      fromHsv(
        hue,
        Math.min(1, 2 * Math.hypot(dx, dy)),
        Math.max(brightness, 0.15),
      ),
    );
  };

  const shell = trigger.current?.closest(".app-shell");
  return (
    <div className="color-picker-wrap">
      <button
        ref={trigger}
        type="button"
        className="color-picker-trigger"
        title={t("选择词条颜色")}
        aria-label={t("选择词条颜色")}
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
      >
        <i style={{ background: selection }} />
        <span>{selection.toUpperCase()}</span>
        <Palette size={14} />
        <ChevronDown size={13} />
      </button>
      {shell &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panel}
                className="color-picker-popover glass-menu"
                style={position!}
                {...glassSlide(4)}
                transition={{ duration: 0.16 }}
              >
                <div className="color-picker-heading">{t("预设色板")}</div>
                <div className="color-swatches">
                  {PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      aria-label={`${t("选择")} ${color}`}
                      aria-pressed={
                        color.toLowerCase() === selection.toLowerCase()
                      }
                      style={{ "--swatch": color } as React.CSSProperties}
                      onClick={() => { setHexInput(null); onChange(color); }}
                    >
                      {color.toLowerCase() === selection.toLowerCase() && (
                        <Check size={11} />
                      )}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="dropdown-trigger wheel-trigger"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((current) => !current)}
                >
                  <span>{t("自定义颜色")}</span>
                  <ChevronDown size={13} />
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      className="wheel-panel"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <div className="color-picker-heading">{t("RGB 色轮")}</div>
                      <div
                        className="color-wheel"
                        role="slider"
                        aria-label={t("色相")}
                        aria-valuemin={0}
                        aria-valuemax={359}
                        aria-valuenow={Math.floor(hue)}
                        tabIndex={0}
                        onPointerDown={(event) => {
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                          pick(event);
                        }}
                        onPointerMove={(event) => {
                          if (event.buttons & 1) pick(event);
                        }}
                        onKeyDown={(event) => {
                          if (!event.key.startsWith("Arrow")) return;
                          event.preventDefault();
                          setHexInput(null);
                          const delta =
                            event.key === "ArrowLeft" ||
                            event.key === "ArrowDown"
                              ? -5
                              : 5;
                          onChange(
                            fromHsv(
                              (hue + delta + 360) % 360,
                              Math.max(saturation, 0.3),
                              Math.max(brightness, 0.15),
                            ),
                          );
                        }}
                      >
                        <span
                          style={{
                            left: 50 + 48 * saturation * Math.sin(angle) + "%",
                            top: 50 - 48 * saturation * Math.cos(angle) + "%",
                            background: selection,
                          }}
                        />
                      </div>
                      <label className="wheel-brightness">
                        {t("亮度")}
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(brightness * 100)}
                          onChange={(event) => {
                            setHexInput(null);
                            onChange(
                              fromHsv(
                                hue,
                                saturation,
                                Number(event.target.value) / 100,
                              ),
                            );
                          }}
                        />
                      </label>
                      <div className="rgb-channels">
                        {["红", "绿", "蓝"].map((channel, index) => (
                          <label key={channel}>
                            {t(channel)}
                            <input
                              type="number"
                              min={0}
                              max={255}
                              value={rgb[index]}
                              onChange={(event) => {
                                setHexInput(null);
                                const channelValue = Math.min(
                                  255,
                                  Math.max(0, Number(event.target.value)),
                                );
                                onChange(
                                  toHex(
                                    rgb.map((value, offset) =>
                                      offset === index ? channelValue : value,
                                    ),
                                  ),
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>
                      <div className="rgb-channels color-hex">
                        <label>
                          {t("十六进制")}
                          <input value={hexInput ?? selection.toUpperCase()}
                            onChange={(event) => setHexInput(event.target.value)}
                            aria-invalid={!validHex}
                            title={t("请输入六位十六进制颜色值")}
                            spellCheck={false} />
                        </label>
                      </div>
                      <div className="color-picker-actions">
                        <button type="button" className="secondary-button" onClick={() => {
                          setHexInput(null);
                          onChange(openedColor.current);
                        }}>{t("重置")}</button>
                        <button type="button" className="primary-button" disabled={!validHex}
                          onClick={() => {
                            if (hexInput !== null) onChange(`#${hex.toUpperCase()}`);
                            setPosition(null);
                            trigger.current?.focus();
                          }}>{t("确认")}</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>,
          shell,
        )}
    </div>
  );
}

function toHex(rgb: number[]) {
  return (
    "#" +
    rgb
      .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
      .join("")
  );
}

function toHsv(rgb: number[]): [number, number, number] {
  const [red, green, blue] = rgb.map((channel) => channel / 255);
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const span = high - low;
  if (!span) return [0, 0, high];
  const sector =
    high === red
      ? (green - blue) / span
      : high === green
        ? 2 + (blue - red) / span
        : 4 + (red - green) / span;
  return [(sector * 60 + 360) % 360, span / high, high];
}

function fromHsv(hue: number, saturation: number, brightness: number) {
  return toHex(
    [5, 3, 1].map((offset) => {
      const sector = (offset + hue / 60) % 6;
      return (
        255 *
        brightness *
        (1 - saturation * Math.max(0, Math.min(sector, 4 - sector, 1)))
      );
    }),
  );
}
