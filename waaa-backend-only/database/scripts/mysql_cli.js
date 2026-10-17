import { spawn } from "child_process";
import fs from "fs";
import net from "net";

const MYSQL_PATHS = [
  "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe",
  "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe",
  "mysql",
];

function findMysqlExe() {
  for (const p of MYSQL_PATHS) {
    if (p === "mysql" || fs.existsSync(p)) {
      return p;
    }
  }
  return "mysql";
}

function checkPortOpen(port = 3306, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(1000);
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      sock.destroy();
      resolve(false);
    });
    sock.once("timeout", () => {
      sock.destroy();
      resolve(false);
    });
    sock.connect(port, host);
  });
}

async function main() {
  const isPortUp = await checkPortOpen(3306);
  if (!isPortUp) {
    console.warn("\n⚠️  MySQL server is not running on port 3306.");
    console.warn("Starting MySQL daemon in the background...\n");
    try {
      const { spawn: spawnBg } = await import("child_process");
      const mysqldPath = "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe";
      if (fs.existsSync(mysqldPath)) {
        const bg = spawnBg(
          mysqldPath,
          [
            '--datadir=c:\\WAAA\\waaa-backend-only\\database\\mysql_data',
            '--port=3306',
            '--console'
          ],
          { detached: true, stdio: "ignore" }
        );
        bg.unref();
        // Wait 2.5s for server to initialize
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 400));
          if (await checkPortOpen(3306)) break;
        }
      }
    } catch {
      // ignore
    }
  }

  const exe = findMysqlExe();
  const cliArgs = process.argv.slice(2);

  const args = [];
  if (!cliArgs.some((a) => a === "-u" || a.startsWith("--user"))) {
    args.push("-u", "root");
  }

  if (!cliArgs.some((a) => a === "-D" || a.startsWith("--database"))) {
    args.push("-D", "waaa_db");
  }

  args.push(...cliArgs);

  const child = spawn(exe, args, {
    stdio: "inherit",
    shell: false,
  });

  child.on("error", (err) => {
    console.error("Failed to start MySQL client:", err.message);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main();
