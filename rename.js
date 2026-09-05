const fs = require('fs');
const path = require('path');

// Directories whose "Engram" -> "Smaran" rename is handled separately
// (already fixed by hand, more thoroughly than a text replace can manage:
// actual API calls rewritten, not just branding text) and must not be
// touched by this pass, to avoid clobbering that work.
const skipDirs = [
  'apps/mcp',
  'packages/agent-framework-python',
  'packages/cartesia-sdk-python',
  'packages/openai-sdk-python',
  'packages/pipecat-sdk-python',
];

const targetDirs = [
  path.join(__dirname, 'apps/web'),
  path.join(__dirname, 'apps/docs'),
  path.join(__dirname, 'apps/browser-extension'),
  path.join(__dirname, 'apps/raycast-extension'),
  path.join(__dirname, 'apps/memory-graph-playground'),
  path.join(__dirname, 'apps/reranker-worker'),
  path.join(__dirname, 'packages'),
  path.join(__dirname, 'skills'),
];

const ignoreDirs = ['node_modules', '.next', 'dist', 'build', '.git', '.wxt', '.turbo', '.venv', '__pycache__'];
const skipDirsAbs = skipDirs.map((d) => path.join(__dirname, d));

// Text-file extensions worth scanning. Content-only rename: this does not
// rename files or directories, so existing URLs/paths keep working even
// where "engram" still appears in a filename (e.g. why-engram.mdx) --
// that's a separate, more disruptive decision (breaks/redirects live
// links) left for later.
const TEXT_FILE_RE = /\.(ts|tsx|js|jsx|json|jsonc|md|mdx|mdc|css|html|toml|txt|py|rs|svg|env.*)$/;

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    if (ignoreDirs.includes(file)) return;
    const filePath = path.join(dir, file);
    if (skipDirsAbs.includes(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else {
      results.push(filePath);
    }
  });
  return results;
}

let changedCount = 0;

targetDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) return;
  const files = walk(dir);

  files.forEach((file) => {
    const base = path.basename(file);
    const isTextFile = TEXT_FILE_RE.test(file) || base === 'LICENSE';
    if (!isTextFile) return;

    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      return; // binary or unreadable, skip
    }

    const newContent = content
      .replace(/Engram/g, 'Smaran')
      .replace(/engram/g, 'smaran')
      .replace(/ENGRAM/g, 'SMARAN');

    if (content !== newContent) {
      fs.writeFileSync(file, newContent, 'utf8');
      console.log(`Updated: ${file}`);
      changedCount++;
    }
  });
});

console.log(`Done renaming! ${changedCount} file(s) updated.`);
