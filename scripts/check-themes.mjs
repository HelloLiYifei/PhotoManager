import fs from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const themesRoot = path.join(srcRoot, "themes");
const allowedVisualLiteralFile = path.join(srcRoot, "content", "contentColors.js");
const errors = [];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

function relative(file, base = root) {
  return path.relative(base, file).replace(/\\/g, "/");
}

const allSourceFiles = await walk(srcRoot);
for (const file of allSourceFiles.filter((candidate) => candidate.endsWith(".css"))) {
  if (!file.startsWith(`${themesRoot}${path.sep}`)) {
    errors.push(`First-party CSS must live in a theme folder: ${relative(file)}`);
  }
}

const themeDirectories = (await fs.readdir(themesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (themeDirectories.length < 2) errors.push("At least two complete themes are required");

const manifests = [];
const themeFiles = new Map();
const tokenSets = new Map();
const themeCss = new Map();

for (const directory of themeDirectories) {
  const themeDirectory = path.join(themesRoot, directory);
  const manifestPath = path.join(themeDirectory, "theme.json");
  const entryPath = path.join(themeDirectory, "index.css");
  const tokenPath = path.join(themeDirectory, "tokens.css");

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifests.push(manifest);
  } catch (error) {
    errors.push(`Cannot read ${relative(manifestPath)}: ${error.message}`);
    continue;
  }

  if (manifest.id !== directory) errors.push(`Theme id must match directory: ${directory}`);
  if (!manifest.labels?.["zh-CN"] || !manifest.labels?.["en-US"]) {
    errors.push(`Theme ${directory} must provide zh-CN and en-US labels`);
  }
  if (!["dark", "light"].includes(manifest.colorScheme)) {
    errors.push(`Theme ${directory} has an invalid colorScheme`);
  }
  if (!Number.isFinite(manifest.order) || typeof manifest.systemDefault !== "boolean") {
    errors.push(`Theme ${directory} has incomplete ordering/default metadata`);
  }

  const files = (await walk(themeDirectory)).filter((file) => file.endsWith(".css"));
  const relativeFiles = files.map((file) => relative(file, themeDirectory)).sort();
  themeFiles.set(directory, relativeFiles);
  themeCss.set(directory, (await Promise.all(files.map((file) => fs.readFile(file, "utf8")))).join("\n"));

  const reachable = new Set();
  async function followImports(file) {
    const normalized = path.normalize(file);
    if (reachable.has(normalized)) return;
    reachable.add(normalized);
    const source = await fs.readFile(normalized, "utf8");
    for (const match of source.matchAll(/@import\s+["']([^"']+)["']/g)) {
      const imported = path.resolve(path.dirname(normalized), match[1]);
      if (!imported.startsWith(`${themeDirectory}${path.sep}`)) {
        errors.push(`Theme ${directory} imports CSS outside its folder: ${match[1]}`);
        continue;
      }
      await followImports(imported);
    }
  }

  try {
    await followImports(entryPath);
  } catch (error) {
    errors.push(`Theme ${directory} has a broken CSS import: ${error.message}`);
  }
  for (const file of files) {
    if (!reachable.has(path.normalize(file))) {
      errors.push(`Theme CSS is not reachable from index.css: ${relative(file)}`);
    }
  }

  try {
    const tokenRoot = postcss.parse(await fs.readFile(tokenPath, "utf8"));
    const tokens = new Set();
    tokenRoot.walkDecls(/^--/, (declaration) => tokens.add(declaration.prop));
    tokenSets.set(directory, tokens);
    if (!tokens.size) errors.push(`Theme ${directory} does not define design tokens`);
  } catch (error) {
    errors.push(`Cannot parse ${relative(tokenPath)}: ${error.message}`);
  }
}

const ids = manifests.map((manifest) => manifest.id);
if (new Set(ids).size !== ids.length) errors.push("Theme ids must be unique");
for (const scheme of ["dark", "light"]) {
  const defaults = manifests.filter(
    (manifest) => manifest.colorScheme === scheme && manifest.systemDefault,
  );
  if (defaults.length !== 1) errors.push(`Exactly one ${scheme} theme must be systemDefault`);
}

const referenceDirectory = themeDirectories[0];
const referenceFiles = themeFiles.get(referenceDirectory) ?? [];
const referenceTokens = tokenSets.get(referenceDirectory) ?? new Set();
for (const directory of themeDirectories.slice(1)) {
  const files = themeFiles.get(directory) ?? [];
  if (JSON.stringify(files) !== JSON.stringify(referenceFiles)) {
    errors.push(`Theme ${directory} must have the same CSS file structure as ${referenceDirectory}`);
  }
  const tokens = tokenSets.get(directory) ?? new Set();
  const missing = [...referenceTokens].filter((token) => !tokens.has(token));
  const extra = [...tokens].filter((token) => !referenceTokens.has(token));
  if (missing.length || extra.length) {
    errors.push(`Theme ${directory} token contract differs (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`);
  }
}

const classContractSource = await fs.readFile(path.join(themesRoot, "classNames.js"), "utf8");
const classContract = new Set(
  [...classContractSource.matchAll(/["'](pm-[a-z0-9-]+)["']/g)].map((match) => match[1]),
);
if (!classContract.size) errors.push("The stable class-name contract is empty");
for (const directory of themeDirectories) {
  const css = themeCss.get(directory) ?? "";
  const missing = [...classContract].filter((className) => !css.includes(`.${className}`));
  if (missing.length) {
    errors.push(`Theme ${directory} is missing stable classes: ${missing.join(", ")}`);
  }
}

const visualLiteralPattern = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|fontFamily\s*:/i;
for (const file of allSourceFiles) {
  if (!/\.(?:js|jsx)$/.test(file)) continue;
  if (file.startsWith(`${themesRoot}${path.sep}`)) continue;
  if (file === allowedVisualLiteralFile || /\.test\.[cm]?[jt]sx?$/.test(file)) continue;
  const source = await fs.readFile(file, "utf8");
  if (visualLiteralPattern.test(source)) {
    errors.push(`Visual literal must be moved to a theme or content color module: ${relative(file)}`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${themeDirectories.length} complete themes and ${classContract.size} stable classes.`);
}
