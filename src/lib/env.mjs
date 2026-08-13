export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name, fallback = "") {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function maskSecret(value) {
  if (!value) return "missing";
  if (value.length <= 8) return "configured";
  return `${value.slice(0, 3)}…${value.slice(-3)}`;
}
