import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

// Cargar CSV
const users = new SharedArray('users', function () {
  return open('../user.csv')
    .split('\n')
    .slice(1)
    .map(line => {
      const [user, passwd] = line.split(',');
      return { user, passwd };
    });
});

// Configuración para 20 TPS aprox
export const options = {
  scenarios: {
    loginTest: {
      executor: 'constant-arrival-rate',
      rate: 20, // 20 TPS
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<1500'], // 95% < 1.5s
    http_req_failed: ['rate<0.03'],    // <3% errores
  },
};

export default function () {
  const user = users[Math.floor(Math.random() * users.length)];

  const payload = JSON.stringify({
    username: user.user,
    password: user.passwd,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(
    'https://fakestoreapi.com/auth/login',
    payload,
    params
  );

  check(res, {
    'status es 200': (r) => r.status === 200,
    'tiempo < 1.5s': (r) => r.timings.duration < 1500,
  });

  sleep(1);
}

export function handleSummary(data) {
  // Calcular métricas clave
  const totalRequests  = data.metrics.http_reqs?.values?.count    ?? 0;
  const failedChecks   = data.metrics.checks?.values?.fails       ?? 0;
  const p95Duration    = data.metrics.http_req_duration?.values?.['p(95)'] ?? 0;
  const p99Duration    = data.metrics.http_req_duration?.values?.['p(99)'] ?? 0;
  const avgDuration    = data.metrics.http_req_duration?.values?.avg ?? 0;
  const maxDuration    = data.metrics.http_req_duration?.values?.max ?? 0;
  const errorRateVal   = data.metrics.error_rate?.values?.rate     ?? 0;
  const testDuration   = data.state?.testRunDurationMs             ?? 0;
  const tps            = totalRequests / (testDuration / 1000);

  const successThreshold_time  = p95Duration < 1500 ? 'PASS' : ' FAIL';
  const successThreshold_error = errorRateVal < 0.03 ? 'PASS' : ' FAIL';
  const successTPS             = tps >= 20           ? 'PASS' : ' FAIL';

  const report = `
================================================================================
                   REPORTE DE PRUEBA DE CARGA - K6
                   FakeStore API - Servicio de Login


Fecha de ejecución : ${new Date().toISOString()}
Duración total     : ${(testDuration / 1000).toFixed(1)}s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 THROUGHPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total de requests    : ${totalRequests}
  TPS promedio         : ${tps.toFixed(2)} req/s  ${successTPS}
  Objetivo TPS         : ≥ 20 TPS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TIEMPOS DE RESPUESTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Promedio             : ${avgDuration.toFixed(2)} ms
  Percentil 95 (p95)   : ${p95Duration.toFixed(2)} ms  ${successThreshold_time}
  Percentil 99 (p99)   : ${p99Duration.toFixed(2)} ms
  Máximo               : ${maxDuration.toFixed(2)} ms
  Umbral permitido     : < 1500 ms (p95)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TASA DE ERRORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Tasa de error        : ${(errorRateVal * 100).toFixed(2)}%  ${successThreshold_error}
  Checks fallidos      : ${failedChecks}
  Umbral aceptable     : < 3%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 RESULTADO FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TPS ≥ 20             : ${successTPS}
  p95 < 1500ms         : ${successThreshold_time}
  Error rate < 3%      : ${successThreshold_error}
================================================================================
`;

  // Imprimir en consola
  console.log(report);

  return {
    'results/Load_report.txt': report,
    stdout: report,
  };
}