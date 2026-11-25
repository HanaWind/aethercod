import { AnimatePresence, motion } from "framer-motion";
import {
  Badge,
  Bird,
  Bug,
  BookOpen,
  Castle,
  Clock3,
  Compass,
  Crown,
  Flame,
  Fish,
  Gem,
  Globe2,
  Hammer,
  Heart,
  History,
  KeyRound,
  Landmark,
  MapPin,
  Mountain,
  Package,
  PawPrint,
  Scroll,
  ScrollText,
  Shield,
  Snowflake,
  Sparkles,
  Star,
  Swords,
  UserRound,
  UserRoundPlus,
  UsersRound,
  WandSparkles,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { glassSlide } from "./glassMotion";
import { translate, type Language } from "./i18n";

const GROUPS: Array<{
  label: string;
  choices: Array<{ name: string; label: string; Icon: LucideIcon }>;
}> = [
  {
    label: "人物与角色",
    choices: [
      { name: "UserRound", label: "人物", Icon: UserRound },
      { name: "UsersRound", label: "群体", Icon: UsersRound },
      { name: "UserRoundPlus", label: "新角色", Icon: UserRoundPlus },
      { name: "Crown", label: "王族", Icon: Crown },
    ],
  },
  {
    label: "地理与建筑",
    choices: [
      { name: "MapPin", label: "地点", Icon: MapPin },
      { name: "Mountain", label: "山地", Icon: Mountain },
      { name: "Landmark", label: "地标", Icon: Landmark },
      { name: "Castle", label: "城堡", Icon: Castle },
      { name: "Globe2", label: "世界", Icon: Globe2 },
      { name: "Compass", label: "方位", Icon: Compass },
    ],
  },
  {
    label: "势力与徽章",
    choices: [
      { name: "Shield", label: "护盾", Icon: Shield },
      { name: "Badge", label: "徽章", Icon: Badge },
      { name: "Star", label: "星徽", Icon: Star },
      { name: "Heart", label: "盟约", Icon: Heart },
    ],
  },
  {
    label: "魔法与元素",
    choices: [
      { name: "Sparkles", label: "魔法", Icon: Sparkles },
      { name: "WandSparkles", label: "法术", Icon: WandSparkles },
      { name: "Flame", label: "火焰", Icon: Flame },
      { name: "Snowflake", label: "寒霜", Icon: Snowflake },
      { name: "Wind", label: "风息", Icon: Wind },
      { name: "Gem", label: "晶石", Icon: Gem },
    ],
  },
  {
    label: "器物与武器",
    choices: [
      { name: "Swords", label: "武器", Icon: Swords },
      { name: "Hammer", label: "锻造", Icon: Hammer },
      { name: "Package", label: "器物", Icon: Package },
      { name: "KeyRound", label: "钥匙", Icon: KeyRound },
    ],
  },
  {
    label: "生物与种族",
    choices: [
      { name: "PawPrint", label: "生物", Icon: PawPrint },
      { name: "Bird", label: "飞禽", Icon: Bird },
      { name: "Fish", label: "水族", Icon: Fish },
      { name: "Bug", label: "异虫", Icon: Bug },
    ],
  },
  {
    label: "典籍与历史",
    choices: [
      { name: "BookOpen", label: "典籍", Icon: BookOpen },
      { name: "ScrollText", label: "文书", Icon: ScrollText },
      { name: "Scroll", label: "卷轴", Icon: Scroll },
      { name: "History", label: "历史", Icon: History },
      { name: "Clock3", label: "纪年", Icon: Clock3 },
    ],
  },
];

const ICON_BY_NAME = new Map(
  GROUPS.flatMap((group) =>
    group.choices.map((choice) => [choice.name, choice.Icon] as const),
  ),
);

export function getTypeIcon(name: string): LucideIcon | undefined {
  return ICON_BY_NAME.get(name);
}

export default function TypeIconPicker({
  value,
  language,
  onChange,
  disabled = false,
}: {
  value: string;
  language: Language;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [position, setPosition] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = Boolean(position && !disabled);
  const SelectedIcon = getTypeIcon(value);
  const t = (key: string) => translate(language, key);
  const title = t("选择类型图标");
  const term = query.trim().toLocaleLowerCase();
  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    choices: group.choices.filter(({ name, label }) =>
      [name, label, t(label), group.label, t(group.label)]
        .some((text) => text.toLocaleLowerCase().includes(term)),
    ),
  })).filter((group) => group.choices.length);
  const selectedChoice = GROUPS.flatMap((group) => group.choices).find((choice) => choice.name === value);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) &&
        !menu.current?.contains(event.target))
        setPosition(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPosition(null);
      root.current?.querySelector("button")?.focus();
    };
    const closeWhenAnchorMoves = (event: Event) => {
      if (!(event.target instanceof Node && menu.current?.contains(event.target))) setPosition(null);
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape, true);
    window.addEventListener("scroll", closeWhenAnchorMoves, true);
    window.addEventListener("resize", closeWhenAnchorMoves);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape, true);
      window.removeEventListener("scroll", closeWhenAnchorMoves, true);
      window.removeEventListener("resize", closeWhenAnchorMoves);
    };
  }, [open]);

  const shell = root.current?.closest(".app-shell");

  return (
    <div className="type-icon-picker" ref={root}>
      <button
        type="button"
        className="type-icon-trigger"
        aria-label={title}
        aria-expanded={open}
        disabled={disabled}
        onClick={(event) => {
          if (open) {
            setPosition(null);
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          setQuery("");
          const width = Math.min(Math.max(220, bounds.width), window.innerWidth - 16);
          const below = window.innerHeight - bounds.bottom;
          const above = below < 256 && bounds.top > below;
          setPosition({
            left: Math.min(bounds.left, window.innerWidth - width - 8),
            width,
            maxHeight: Math.min(250, (above ? bounds.top : below) - 14),
            ...(above ? { bottom: window.innerHeight - bounds.top + 6 } : { top: bounds.bottom + 6 }),
          });
        }}
      >
        {SelectedIcon ? <SelectedIcon size={16} /> : <span>{value || "✦"}</span>}
        <span>{selectedChoice ? t(selectedChoice.label) : t("自定义符号")}</span>
      </button>
      {shell && createPortal(
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="type-icon-menu glass-menu"
            ref={menu}
            role="dialog"
            aria-label={title}
            style={position!}
            {...glassSlide(position?.bottom ? 4 : -4)}
            onMouseDown={(event) => event.stopPropagation()}
            transition={{ duration: 0.15 }}
          >
            <header className="type-icon-search">
              <strong>{title}</strong>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                placeholder={t("搜索图标…")} aria-label={t("搜索图标…")} />
            </header>
            {visibleGroups.map((group) => (
              <section key={group.label}>
                <h3>{t(group.label)}</h3>
                <div className="type-icon-options">
                  {group.choices.map(({ name, label, Icon }) => (
                    <button
                      key={name}
                      type="button"
                      aria-label={t(label)}
                      aria-pressed={value === name}
                      title={t(label)}
                      onClick={() => {
                        onChange(name);
                        setPosition(null);
                        root.current?.querySelector("button")?.focus();
                      }}
                    >
                      <Icon size={17} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {!visibleGroups.length && <p role="status">{t("没有匹配的图标")}</p>}
          </motion.div>
        )}
      </AnimatePresence>, shell)}
    </div>
  );
}
