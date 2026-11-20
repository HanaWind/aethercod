import type { EntityDate } from "./api";

function formatPoint(
  value: string | null | undefined,
  year: number | null | undefined,
  era: string,
) {
  const match = value?.match(/^([+-]?\d+)(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  const number = match ? Number(match[1]) : year;
  if (number == null) return value || "";
  return [
    number < 0 ? era + "前 " : era + " ",
    Math.abs(number),
    " 年",
    match?.[2] ? " " + Number(match[2]) + " 月" : "",
    match?.[3] ? " " + Number(match[3]) + " 日" : "",
  ].join("");
}

export function formatWorldDate(date: EntityDate, era: string) {
  const start = formatPoint(date.date_value, date.year, era) || "日期待定";
  const end = formatPoint(date.end_date_value, date.end_year, era);
  return end ? start + " — " + end : start;
}
