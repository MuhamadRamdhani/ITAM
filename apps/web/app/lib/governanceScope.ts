export type LookupLike = {
  id: number;
  name?: string;
  label?: string;
  display_name?: string;
  email?: string;
};

export type ActiveGovernanceScope = {
  versionNo: number | null;
  assetTypeCodes: string[];
  departmentIds: number[];
  locationIds: number[];
  departmentTokens: string[];
  locationTokens: string[];
  environmentCodes: string[];
  notes: string;
  stakeholderSummary: string;
};

function safeParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeScopeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of value) {
    const text = normalizeText(item).toUpperCase();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }

  return out;
}

export function normalizeScopeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<number>();
  const out: number[] = [];

  for (const item of value) {
    const n = Number(item);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }

  return out;
}

export function normalizeScopeTokenArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of value) {
    const text = normalizeText(item);
    if (!text) continue;
    const token = text.toUpperCase();
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }

  return out;
}

export function parseActiveScopeJson(
  scopeJson: unknown,
  versionNo: number | string | null = null
): ActiveGovernanceScope {
  const source =
    typeof scopeJson === "string"
      ? safeParseJson(scopeJson)
      : scopeJson && typeof scopeJson === "object"
        ? scopeJson
        : {};

  const parsedVersionNo = Number(versionNo);

  return {
    versionNo: Number.isFinite(parsedVersionNo) && parsedVersionNo > 0 ? parsedVersionNo : null,
    assetTypeCodes: normalizeScopeTextArray((source as any)?.asset_type_codes),
    departmentIds: normalizeScopeNumberArray((source as any)?.department_ids),
    locationIds: normalizeScopeNumberArray((source as any)?.location_ids),
    departmentTokens: normalizeScopeTokenArray((source as any)?.department_ids),
    locationTokens: normalizeScopeTokenArray((source as any)?.location_ids),
    environmentCodes: normalizeScopeTextArray((source as any)?.environments),
    notes: normalizeText((source as any)?.notes),
    stakeholderSummary: normalizeText((source as any)?.stakeholder_summary),
  };
}

export function displayLookup(item?: LookupLike | null): string {
  if (!item) return "";
  return normalizeText(item.name || item.label || item.display_name || item.email || `#${item.id}`);
}

export function resolveLookupLabel(items: LookupLike[], id: number | null): string | null {
  if (id == null) return null;
  const item = items.find((row) => Number(row.id) === Number(id));
  const label = displayLookup(item ?? null);
  return label || null;
}

export function isWithinScopedIds(value: number | null, allowedIds: number[]): boolean {
  if (value == null) return false;
  if (!Array.isArray(allowedIds) || allowedIds.length === 0) return true;
  return allowedIds.includes(Number(value));
}

export function lookupMatchesScope(
  item: LookupLike & { code?: string },
  allowedTokens: string[]
): boolean {
  if (!Array.isArray(allowedTokens) || allowedTokens.length === 0) return true;

  const tokens = [
    String(item.id ?? "").trim(),
    item.code,
    item.name,
    item.label,
    item.display_name,
    item.email,
  ]
    .map((token) => normalizeText(token).toUpperCase())
    .filter(Boolean);

  return tokens.some((token) => allowedTokens.includes(token));
}

export function resolveScopedLookupLabel(
  items: (LookupLike & { code?: string })[],
  id: number | null,
  allowedTokens: string[]
): string | null {
  if (id == null) return null;
  const item = items.find((row) => Number(row.id) === Number(id));
  if (!item) return null;
  if (!lookupMatchesScope(item, allowedTokens)) return null;
  const label = displayLookup(item);
  return label || null;
}
