type Value = number | boolean | readonly number[];

function sameValue(a: Value | undefined, b: Value | undefined) {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
  return a.length === b.length && a.every((component, index) => component === b[index]);
}

export function sameValues(a: Record<string, Value>, b: Record<string, Value>) {
  const names = Object.keys(b);
  return names.length === Object.keys(a).length && names.every(name => sameValue(a[name], b[name]));
}
