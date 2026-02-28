import { execFileSync } from "node:child_process";
import fg from "fast-glob";

const [guardScript, pattern] = process.argv.slice(2);
if (!guardScript || !pattern) {
  console.error("Usage: node glob-runner.mjs <guardScript> <globPattern>");
  process.exit(1);
}

const files = await fg(pattern, { dot: false });
if (!files.length) process.exit(0);

execFileSync("node", [guardScript, ...files], { stdio: "inherit" });