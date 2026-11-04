// SessionStart hook: if Brief Town isn't set up yet, tell Claude to offer setup right away.
import fs from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
let configured = false;
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "brief.config.json"), "utf8"));
  configured = Array.isArray(cfg.allowedTools) && cfg.allowedTools.length > 0 && !cfg.allowedTools.some((t) => t.includes("<"));
} catch {}

if (!configured) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext:
        "Brief Town is not set up on this computer yet (brief.config.json is missing or has no allowedTools). " +
        "In your first reply, greet the user, explain in one or two sentences what Brief Town is, and offer to set it up now. " +
        "If they agree, or their first message is about setup, follow the brief-town-setup skill.",
    },
  }));
}
