/*
  Mata cualquier dev de Next escuchando en 3000-3010 (sin borrar .next).
  Se corre AUTOMATICO antes de "npm run dev" (hook predev) para que nunca se
  acumulen varios dev servers (la causa del ChunkLoadError / puerto 3001, 3002...).
  Funciona en Windows, Linux y Mac. Siempre sale 0 para no frenar el arranque.
*/
import { execSync } from "node:child_process";

const PUERTOS = Array.from({ length: 11 }, (_, i) => 3000 + i);
const correr = (cmd) => {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString();
  } catch {
    return "";
  }
};

const pids = new Set();

if (process.platform === "win32") {
  // netstat: la última columna es el PID del proceso que escucha.
  for (const linea of correr("netstat -ano -p tcp").split(/\r?\n/)) {
    const m = linea.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
    if (m && PUERTOS.includes(Number(m[1]))) pids.add(m[2]);
  }
} else {
  for (const puerto of PUERTOS) {
    for (const pid of correr(`lsof -ti tcp:${puerto} -sTCP:LISTEN`).split(/\s+/)) {
      if (pid) pids.add(pid);
    }
  }
}

for (const pid of pids) {
  if (String(pid) === String(process.pid)) continue;
  // Solo matamos procesos node: no queremos voltear otra cosa que use el puerto.
  const esNode =
    process.platform === "win32"
      ? /node\.exe/i.test(correr(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`))
      : /node/i.test(correr(`ps -p ${pid} -o comm=`));
  if (!esNode) continue;
  if (process.platform === "win32") correr(`taskkill /PID ${pid} /F /T`);
  else {
    try {
      process.kill(Number(pid), "SIGKILL");
    } catch {}
  }
}

process.exit(0);
