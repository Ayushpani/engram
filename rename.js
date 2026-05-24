const fs = require('fs');
const path = require('path');

const targetDirs = [
  path.join(__dirname, 'apps/web'),
  path.join(__dirname, 'apps/mcp'),
  path.join(__dirname, 'packages'),
];

const ignoreDirs = ['node_modules', '.next', 'dist', 'build', '.git'];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    if (ignoreDirs.includes(file)) return;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else {
      results.push(filePath);
    }
  });
  return results;
}

targetDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) return;
  const files = walk(dir);
  
  files.forEach((file) => {
    // Only process text files
    if (file.match(/\.(ts|tsx|js|jsx|json|md|css|html|env.*)$/)) {
      let content = fs.readFileSync(file, 'utf8');
      let newContent = content
        .replace(/Engram/g, 'Smaran')
        .replace(/engram/g, 'smaran')
        .replace(/ENGRAM/g, 'SMARAN');
      
      if (content !== newContent) {
        fs.writeFileSync(file, newContent, 'utf8');
        console.log(`Updated: ${file}`);
      }
    }
  });
});
console.log("Done renaming!");
