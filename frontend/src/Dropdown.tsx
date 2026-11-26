import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { glassSlide } from "./glassMotion";

type Option = { value: string; label: string };
type Selection =
  | { multiple?: false; value: string; onChange: (value: string) => void }
  | { multiple: true; value: string[]; onChange: (value: string[]) => void; clearLabel?: string };

export default function Dropdown(
  props: Selection & {
    options: Option[];
    label: string;
    placeholder?: string;
    disabled?: boolean;
  },
) {
  const { options, label, placeholder = "未设置", disabled } = props;
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const visible = Boolean(position && !disabled);
  const selected = props.multiple ? props.value : [props.value];

  useEffect(() => {
    if (!visible) return;
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !popup.current?.contains(event.target)
      ) {
        setPosition(null);
      }
    };
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target))
        return;
      setPosition(null);
    };
    const resize = () => setPosition(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", resize);
    (
      popup.current?.querySelector<HTMLButtonElement>(
        '[aria-checked="true"]',
      ) ?? popup.current?.querySelector("button")
    )?.focus();
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [visible]);

  const open = () => {
    const bounds = trigger.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = Math.min(Math.max(bounds.width, 155), window.innerWidth - 16);
    const above =
      window.innerHeight - bounds.bottom <
        Math.min(options.length * 33 + 18, 240) &&
      bounds.top > window.innerHeight - bounds.bottom;
    setPosition({
      left: Math.min(bounds.left, window.innerWidth - width - 8),
      width,
      ...(above
        ? { bottom: window.innerHeight - bounds.top + 6 }
        : { top: bounds.bottom + 6 }),
      maxHeight: Math.min(
        282,
        (above ? bounds.top : window.innerHeight - bounds.bottom) - 14,
      ),
    });
  };

  const shell = trigger.current?.closest(".app-shell");
  return (
    <div className="dropdown">
      <button
        ref={trigger}
        type="button"
        className="dropdown-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={visible}
        disabled={disabled}
        onClick={() => (visible ? setPosition(null) : open())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !visible) {
            event.preventDefault();
            open();
          }
        }}
      >
        <span>
          {options
            .filter((option) => selected.includes(option.value))
            .map((option) => option.label)
            .join("、") || placeholder}
        </span>
        <ChevronDown size={13} />
      </button>
      {shell &&
        createPortal(
          <AnimatePresence>
            {visible && (
              <motion.div
                ref={popup}
                role="menu"
                aria-label={label}
                className="glass-menu dropdown-menu"
                style={position!}
                {...glassSlide(position?.bottom ? 5 : -5)}
                transition={{ duration: 0.16 }}
                onKeyDown={(event) => {
                  if (event.key === "Escape" || event.key === "Tab") {
                    event.stopPropagation();
                    if (event.key === "Escape") event.preventDefault();
                    setPosition(null);
                    trigger.current?.focus();
                  }
                  if (
                    ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                  ) {
                    event.preventDefault();
                    const items = Array.from(
                      popup.current?.querySelectorAll("button") ?? [],
                    );
                    const index = items.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? items.length - 1
                          : (index +
                              (event.key === "ArrowDown" ? 1 : -1) +
                              items.length) %
                            items.length;
                    items[next]?.focus();
                  }
                }}
              >
                {options.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    role={props.multiple ? "menuitemcheckbox" : "menuitemradio"}
                    aria-checked={selected.includes(option.value)}
                    onClick={() => {
                      if (disabled) return;
                      if (props.multiple) {
                        props.onChange(
                          selected.includes(option.value)
                            ? selected.filter((value) => value !== option.value)
                            : [...selected, option.value],
                        );
                      } else {
                        props.onChange(option.value);
                        setPosition(null);
                        trigger.current?.focus();
                      }
                    }}
                  >
                    <span>{option.label}</span>
                    {selected.includes(option.value) && <Check size={13} />}
                  </button>
                ))}
                {props.multiple && props.clearLabel && selected.length > 0 && (
                  <button type="button" role="menuitem" onClick={() => {
                    props.onChange([]);
                    setPosition(null);
                    trigger.current?.focus();
                  }}>
                    {props.clearLabel}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          shell,
        )}
    </div>
  );
}
