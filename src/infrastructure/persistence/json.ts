function assertSupportedJsonValue(value: unknown, path: string): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${path} contains a non-finite number`);
  }

  if (
    typeof value === "bigint" ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    value === undefined
  ) {
    throw new Error(`${path} contains a value that JSON cannot preserve`);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSupportedJsonValue(item, `${path}[${index}]`),
    );
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertSupportedJsonValue(item, `${path}.${key}`);
    }
  }
}

export function serializeJsonSnapshot(value: unknown, label: string): string {
  assertSupportedJsonValue(value, label);
  return JSON.stringify(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}

export function serializeCanonicalJson(value: unknown, label: string): string {
  assertSupportedJsonValue(value, label);
  return JSON.stringify(canonicalize(value));
}

export function parseJsonSnapshot<T>(value: string, label: string): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} contains invalid JSON`, { cause: error });
  }

  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`${label} must contain a JSON object or array`);
  }

  return parsed as T;
}
