import type { EntityDate } from "./api";
import type { Language } from "./i18n";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ordinal(day: number) {
  const lastTwo = day % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : ["th", "st", "nd", "rd"][day % 10] ?? "th";
  return day + suffix;
}

function formatPoint(
  value: string | null | undefined,
  year: number | null | undefined,
  era: string,
  language: Language,
) {
  const match = value?.match(/^([+-]?\d+)(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  const number = match ? Number(match[1]) : year;
  if (number == null) return value || "";
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const name = era.trim();
  if (language === "en") {
    const displayYear = name ? Math.abs(number) : number;
    const monthName = months[month - 1];
    const date = monthName
      ? monthName + (day ? " " + ordinal(day) : "") + ", " + displayYear
      : "Year " + displayYear;
    return name ? date + (number < 0 ? " before " : " · ") + name : date;
  }
  const prefix = name ? name + (number < 0 ? "前 " : " ") : number < 0 ? "-" : "";
  const yearText = match ? match[1].replace(/^[+-]/, "") : String(Math.abs(number));
  return prefix + yearText + "年" +
    (month ? String(month).padStart(2, "0") + "月" : "") +
    (day ? String(day).padStart(2, "0") + "日" : "");
}

export function formatWorldDate(date: EntityDate, era: string, language: Language = "zh") {
  const start = formatPoint(date.date_value, date.year, era, language) || (language === "en" ? "Date unknown" : "日期待定");
  const end = formatPoint(date.end_date_value, date.end_year, era, language);
  return end ? start + " — " + end : start;
}
