import { fileURLToPath } from "node:url";
import { authCommand } from "./github-host.js";

/** Owner-run live OAuth + native credential-store smoke; never part of CI. */
export async function githubAuthSmoke(args: readonly string[], output = console.log): Promise<number> {
  if (args.length !== 1 || args[0] !== "--authorize-live-github-oauth") {
    output(JSON.stringify({ status: "blocked", reason: "Explicit owner authorization required; no live OAuth or credential-store calls performed" })); return 2;
  }
  const signal = AbortSignal.timeout(300000);
  const login = await authCommand(["login"], output, signal); if (login !== 0) return login;
  const verified = await authCommand(["whoami"], output, signal); if (verified !== 0) return verified;
  const logout = await authCommand(["logout"], output, signal); if (logout !== 0) return logout;
  output(JSON.stringify({ status: "passed", scope: "live GitHub login, Keychain write/read, verified stable identity and logout", operationalL2: "requires separate human approval/resume evidence under the configured host policy" })); return 0;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await githubAuthSmoke(process.argv.slice(2));
