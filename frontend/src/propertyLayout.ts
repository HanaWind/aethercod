import type { Entity } from "./api";

const personFields = ["身份", "本源", "种族", "能力", "称号"];
const polityFields = ["制度", "面积", "人口", "经济"];
const placeBaseFields = ["地点类别"];
const administrativeFields = ["人口", "经济", "地区特色"];
const placeFields = new Map([
  ["大陆", administrativeFields],
  ["国家辖区", administrativeFields],
  ["行省", administrativeFields],
  ["城市", administrativeFields],
  ["村镇", administrativeFields],
  ["遗迹", ["所属时代/文明", "保存状况", "遗迹特征"]],
  ["自然地貌", ["地貌类型", "气候与生态", "地理特征"]],
  ["其他", ["环境概况", "备注特色"]],
]);
const placeTemplate = new Set([...placeBaseFields, ...Array.from(placeFields.values()).flat()]);
const polityTemplate = new Set(polityFields);
const legacyFields = new Set([
  "正式名称",
  "定位/身份",
  "核心特征",
  "地位",
  "面积",
  "地理概述",
  "经济文化与特色",
]);

export function propertyLayout(entity: Entity) {
  const fields = (entity.fields ?? []).filter((field) => field.name !== "英文名" && field.name !== "中文名");
  if (entity.type_id === "person" || entity.type_id === "polity") {
    const sourceOrder = entity.type_id === "person" ? personFields : polityFields;
    const definitions = new Map(fields.map((field) => [field.name, field]));
    return {
      fields: sourceOrder.flatMap((name) => {
        const field = definitions.get(name);
        return field ? [field] : [];
      }),
      additional: [],
    };
  }
  const isPlace = entity.type_id === "place";
  const category = entity.custom_fields["地点类别"];
  const categoryFields = typeof category === "string" ? placeFields.get(category) : undefined;
  const order = isPlace ? [...placeBaseFields, ...(categoryFields ?? [])] : polityFields;
  const template = isPlace ? placeTemplate : polityTemplate;
  const definitions = new Map(fields.map((field) => [field.name, field]));
  return {
    fields: order.flatMap((name) => {
      const field = definitions.get(name);
      return field ? [field] : [];
    }),
    additional: fields.filter((field) => {
      if (template.has(field.name)) return false;
      return !legacyFields.has(field.name);
    }),
  };
}
