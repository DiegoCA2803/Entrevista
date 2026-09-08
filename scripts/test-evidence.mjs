import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

mkdirSync('artifacts', { recursive: true });
const suites = [
  {
    name: 'Reglas de negocio y componentes',
    file: 'artifacts/unit-tests.json',
    args: [
      'node_modules/vitest/vitest.mjs',
      'run',
      'backend/src/tests/business-rules.test.ts',
      'backend/src/tests/di-container.test.ts',
      'backend/src/tests/resilience.test.ts'
    ]
  },
  {
    name: 'PostgreSQL, concurrencia y recuperación HTTP',
    file: 'artifacts/integration-tests.json',
    args: ['scripts/test-integration.mjs']
  }
];
const revision =
  spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() || 'sin commit';
const dirty = !!spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout?.trim();
const lines = [
  '# Evidencia de pruebas MineFleet',
  '',
  `Ejecución: ${new Date().toISOString()}`,
  '',
  `Commit base: ${revision}${dirty ? ' (con cambios locales; los resultados corresponden a esta copia de trabajo)' : ''}`,
  '',
  'Estas pruebas se ejecutan localmente. La integración usa PostgreSQL y un receptor HTTP reales, en una base aislada que se elimina al finalizar. No prueban la infraestructura de Vercel/Neon.',
  ''
];
let failures = 0;
let passed = 0;
for (const suite of suites) {
  if (existsSync(suite.file)) unlinkSync(suite.file);
  console.log(`\nEjecutando: ${suite.name}\n`);
  const result = spawnSync(
    process.execPath,
    [...suite.args, '--reporter=verbose', '--reporter=json', `--outputFile=${suite.file}`],
    { stdio: 'inherit' }
  );
  lines.push(`## ${suite.name}`, '');
  if (result.status !== 0) failures++;
  if (!existsSync(suite.file)) {
    lines.push(
      'No se generó el informe. Revisa la salida de la terminal y que PostgreSQL esté disponible.',
      ''
    );
    if (result.status === 0) failures++;
    continue;
  }
  const report = JSON.parse(readFileSync(suite.file, 'utf8'));
  passed += report.numPassedTests || 0;
  lines.push(
    `Aprobadas: ${report.numPassedTests}. Fallidas: ${report.numFailedTests}. Pendientes: ${report.numPendingTests}.`,
    ''
  );
  for (const file of report.testResults || [])
    for (const test of file.assertionResults || []) {
      lines.push(`- ${test.status === 'passed' ? 'APROBADA' : test.status.toUpperCase()}: ${test.fullName}`);
    }
  lines.push('');
}
lines.splice(2, 0, `Resultado: ${failures ? 'CON FALLOS' : 'APROBADO'} · ${passed} pruebas aprobadas.`, '');
writeFileSync('artifacts/PRUEBAS.md', lines.join('\n') + '\n');
console.log(`\nInforme generado: artifacts/PRUEBAS.md (${passed} aprobadas).`);
process.exit(failures ? 1 : 0);
