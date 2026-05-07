import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

// Carga de datos CSV
const users = new SharedArray('users', function () {
  const raw = open('../user.csv');
  const lines = raw.trim().split('\n');
  return lines.slice(1).map(line => {
    const [user, passwd] = line.split(',');
    return { user: user.trim(), passwd: passwd.trim() };
  });
});

export const options = {
  vus: 1,
  iterations: 5,   // 1 request por cada usuario del CSV
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed:   ['rate<0.03'],
  },
};

export default function () {
  const userIndex  = __ITER % users.length;
  const credentials = users[userIndex];

  console.log(`[Smoke] Probando usuario: ${credentials.user}`);

  const response = http.post(
    'https://fakestoreapi.com/auth/login',
    JSON.stringify({ username: credentials.user, password: credentials.passwd }),
    { headers: { 'Content-Type': 'application/json' }, timeout: '10s' }
  );

  check(response, {
    'status 200':             (r) => r.status === 200,
    'respuesta < 1500ms':     (r) => r.timings.duration < 1500,
    'token presente en body': (r) => {
      try { return !!JSON.parse(r.body).token; } catch { return false; }
    },
  });

  console.log(
    `  → Status: ${response.status} | ` +
    `Duración: ${response.timings.duration.toFixed(0)}ms | ` +
    `Body: ${response.body.substring(0, 80)}`
  );

  sleep(1);
}

// ===============================
// GENERACIÓN DE REPORTES
// ===============================
export function handleSummary(data) {

  const report = `
================================================================================
                   REPORTE DE PRUEBA SMOKE - K6
                   FakeStore API - Servicio Login
================================================================================

Fecha ejecución : ${new Date().toISOString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Requests      : ${data.metrics.http_reqs.values.count}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIEMPOS DE RESPUESTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Promedio            : ${data.metrics.http_req_duration.values.avg.toFixed(2)} ms
p95                 : ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)} ms
Máximo              : ${data.metrics.http_req_duration.values.max.toFixed(2)} ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ERRORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tasa Error          : ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)} %

================================================================================
`;

  return {

    // Consola
    stdout: report,

    // Archivo TXT
    '../results/report_Smoke.txt': report,

    // Archivo JSON
    '../results/summary_smoke.json': JSON.stringify(data, null, 2),
  };
}