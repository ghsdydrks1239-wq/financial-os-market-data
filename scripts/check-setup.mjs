const requiredSecrets = ["KRX_API_KEY", "ECOS_API_KEY"];

let failed = false;
for (const name of requiredSecrets) {
  const configured = Boolean(process.env[name]?.trim());
  console.log(`${configured ? "✓" : "✗"} ${name}: ${configured ? "configured" : "missing"}`);
  if (!configured) failed = true;
}

if (failed) {
  console.error("\nAdd the missing values as GitHub Actions repository secrets.");
  process.exit(1);
}

console.log("\nMarket-data secret setup is ready.");
