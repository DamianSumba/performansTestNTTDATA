PRUEBA DE CARGA - LOGIN API

Herramienta utilizada:
- k6 v0.49.0

Requisitos:
- Node.js (opcional)
- k6 instalado

Instalación k6:
https://k6.io/docs/getting-started/installation/

Ejecución:

1. Clonar el repositorio:
git clone https://github.com/DamianSumba/performansTestNTTDATA.git

2. Ir a la carpeta:
cd k6-login-test

3. Ejecutar prueba:
k6 run LoginTest.js

4. Exportar resultados:
k6 run --summary-export=results/summary.json LoginTest.js

Escenario:
- 20 TPS constantes
- Duración: 1 minuto

Validaciones:
- Tiempo de respuesta < 1.5 segundos
- Error rate < 3%
