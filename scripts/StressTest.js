import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('error_rate');

const users = new SharedArray('users', function () {
  const raw = open('../user.csv');
  const lines = raw.trim().split('\n');
  return lines.slice(1).map(line => {
    const [user, passwd] = line.split(',');
    return { user: user.trim(), passwd: passwd.trim() };
  });
});

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 200,
      stages: [
        { target: 20, duration: '30s' },
        { target: 30, duration: '30s' },
        { target: 40, duration: '30s' },
        { target: 50, duration: '30s' },
        { target: 0,  duration: '20s' },
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<3000'],  // Umbral relajado para estrés
    'error_rate':        ['rate<0.10'],   // Umbral relajado para estrés
  },
};

export default function () {
  const userIndex  = (__VU + __ITER) % users.length;
  const credentials = users[userIndex];

  const response = http.post(
    'https://fakestoreapi.com/auth/login',
    JSON.stringify({ username: credentials.user, password: credentials.passwd }),
    { headers: { 'Content-Type': 'application/json' }, timeout: '15s' }
  );

  const ok = check(response, {
    'status 200':         (r) => r.status === 200,
    'token en respuesta': (r) => {
      try { return !!JSON.parse(r.body).token; } catch { return false; }
    },
  });

  errorRate.add(!ok);
  sleep(0.05);
}

export function handleSummary(data) {

  const report = `
================================================================================
                   REPORTE STRESS TEST - K6
                   FakeStore API - Login
================================================================================

Fecha ejecución : ${new Date().toISOString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Requests      : ${data.metrics.http_reqs.values.count}

TPS Promedio        : ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIEMPOS DE RESPUESTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Promedio            : ${data.metrics.http_req_duration.values.avg.toFixed(2)} ms

p95                 : ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)} ms

Máximo              : ${data.metrics.http_req_duration.values.max.toFixed(2)} ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ERRORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Error Rate          : ${(data.metrics.error_rate.values.rate * 100).toFixed(2)} %

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULTADO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Threshold p95       : ${
    data.metrics.http_req_duration.values['p(95)'] < 3000
      ? 'PASS'
      : 'FAIL'
  }

Threshold Error     : ${
    data.metrics.error_rate.values.rate < 0.10
      ? 'PASS'
      : 'FAIL'
  }

================================================================================
`;

  return {

    stdout: report,

    '../results/stress-report.txt': report,

    '../results/stress-summary.json': JSON.stringify(data, null, 2),
  };
}