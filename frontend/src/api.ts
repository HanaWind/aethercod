export type EntityType = {
  id: string;
  name: string;
  icon: string;
  is_builtin: boolean;
};

export type FieldDefinition = {
  id: string;
  type_id: string;
  name: string;
  field_type: string;
  required: boolean;
  description: string;
  options: string[];
  default_value: unknown;
  protected?: boolean;
};

export type EntitySummary = {
  id: string;
  type_id: string;
  name: string;
  summary: string;
  color: string;
};

export type EntityDate = {
  id?: string;
  date_kind: string;
  label?: string;
  year?: number | null;
  date_value?: string | null;
  precision?: string;
  end_year?: number | null;
  end_date_value?: string | null;
};

export type Relation = {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
  reverse_label: string;
  notes: string;
  direction: "in" | "out";
  other_id: string;
  other_name: string;
  display_label: string;
};

export type Entity = EntitySummary & {
  notes: string;
  remarks: string;
  aliases: string[];
  tags: string[];
  custom_fields: Record<string, unknown>;
  dates: EntityDate[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  type?: EntityType | null;
  fields?: FieldDefinition[];
  relations?: Relation[];
  backlinks?: Array<{ id: string; name: string; color: string }>;
};

export type Project = {
  path: string;
  name: string;
  era_name: string;
  author: string;
  description: string;
};

export type ProjectState = {
  project: Project | null;
  types: EntityType[];
  entities: EntitySummary[];
  writable: boolean;
  read_only: boolean;
};

export type HistoryEntry = {
  id: string;
  version: number;
  changed_by: string;
  changed_at: string;
  change_type: string;
  description: string;
};

export type GraphNode = EntitySummary & {
  x: number;
  y: number;
};

export type GraphEdge = {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type TimelineEntry = {
  id: string;
  entity_id: string;
  name: string;
  type_id: string;
  date_kind: string;
  label: string;
  year: number | null;
  date_value: string | null;
  precision: string;
  end_year: number | null;
  end_date_value: string | null;
};

export type BridgeApi = {
  get_state(): Promise<ProjectState>;
  open_project(path?: string): Promise<ProjectState>;
  create_project(
    path: string,
    name: string,
    era_name: string,
    author: string,
    description: string,
  ): Promise<ProjectState>;
  close_project(): Promise<ProjectState>;
  update_project(
    data: Pick<Project, "name" | "era_name" | "author" | "description">,
  ): Promise<ProjectState>;
  set_read_only(enabled: boolean): Promise<ProjectState>;
  list_entities(query?: string, type_id?: string): Promise<EntitySummary[]>;
  list_types(): Promise<EntityType[]>;
  list_fields(type_id: string): Promise<FieldDefinition[]>;
  create_type(name: string, icon?: string): Promise<EntityType>;
  update_type(
    type_id: string,
    name: string,
    icon?: string,
  ): Promise<EntityType>;
  delete_type(type_id: string): Promise<boolean>;
  save_field(
    field: Partial<FieldDefinition> & { type_id: string },
  ): Promise<FieldDefinition>;
  delete_field(field_id: string): Promise<boolean>;
  get_entity(entity_id: string): Promise<Entity | null>;
  resolve_entity(value: string): Promise<EntitySummary | null>;
  create_entity(type_id: string): Promise<Entity>;
  save_entity(entity: Entity): Promise<Entity>;
  delete_entity(entity_id: string): Promise<boolean>;
  save_relation(
    data: Partial<Relation> & {
      source_id: string;
      target_id: string;
      label: string;
    },
  ): Promise<Relation>;
  delete_relation(relation_id: string): Promise<boolean>;
  get_timeline(entity_id?: string): Promise<TimelineEntry[]>;
  get_history(entity_id: string): Promise<HistoryEntry[]>;
  restore_entity_version(entity_id: string, version: number): Promise<Entity>;
  get_graph(): Promise<GraphData>;
  window_action(
    action: "minimize" | "maximize" | "restore" | "close",
  ): Promise<void>;
};

declare global {
  interface Window {
    pywebview?: { api: BridgeApi };
  }
}

export function desktopApi(): BridgeApi | null {
  return window.pywebview?.api ?? null;
}
