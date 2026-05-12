import { spawn } from "node:child_process";

const disabledExtensions = (process.env.ASCIIDOC_TABLE_DISABLED_EXTENSIONS ?? "openai.chatgpt")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const args = ["--reuse-window"];

for (const extensionId of disabledExtensions) {
  args.push("--disable-extension", extensionId);
}

args.push(process.cwd());

const child = spawn("code", args, {
  stdio: "inherit",
  detached: true
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.unref();
