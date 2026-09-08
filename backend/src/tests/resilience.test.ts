import { describe, it, expect } from 'vitest';
import { ResilientExecutor } from '../resilience/resilient-executor.js';

describe('Resiliencia SOA y Degradación Elegante (Graceful Degradation)', () => {
  it('Degrada elegantemente ante fallo de un servicio auxiliar sin tumbar la aplicación', async () => {
    let fallbackExecuted = false;

    // Simular un servicio con fallo
    const response = await ResilientExecutor.executeWithFallback(
      'ExternalAnalyticsService',
      async () => {
        throw new Error('Timeout de conexión con servicio externo de telemetría.');
      },
      (err) => {
        fallbackExecuted = true;
        return { cachedData: true, reason: err.message };
      }
    );

    expect(response.isDegraded).toBe(true);
    expect(fallbackExecuted).toBe(true);
    expect(response.result.cachedData).toBe(true);
    expect(response.warning).toContain('Timeout de conexión');

    // Verificar que la salud del servicio reporta estado degradado
    const healthList = ResilientExecutor.getServicesHealth();
    const serviceHealth = healthList.find((s) => s.name === 'ExternalAnalyticsService');
    expect(serviceHealth).toBeDefined();
    expect(serviceHealth?.status).toBe('DEGRADED');
  });

  it('Circuit Breaker abre tras fallos consecutivos para proteger el rendimiento', async () => {
    const serviceName = 'HeavyReportingService';
    ResilientExecutor.resetService(serviceName);

    // Provocar 3 fallos consecutivos para cruzar el umbral
    for (let i = 0; i < 3; i++) {
      await ResilientExecutor.executeWithFallback(
        serviceName,
        async () => {
          throw new Error(`Fallo #${i + 1}`);
        },
        () => ({ fallback: true })
      );
    }

    const healthList = ResilientExecutor.getServicesHealth();
    const serviceHealth = healthList.find((s) => s.name === serviceName);
    expect(serviceHealth?.status).toBe('DOWN');

    // La siguiente llamada debe saltarse la acción primaria y usar fallback directo
    let primaryAttempted = false;
    const directFallback = await ResilientExecutor.executeWithFallback<{
      success: boolean;
      fallbackFromCircuitBreaker?: boolean;
    }>(
      serviceName,
      async () => {
        primaryAttempted = true;
        return { success: true };
      },
      () => ({ success: false, fallbackFromCircuitBreaker: true })
    );

    expect(primaryAttempted).toBe(false); // Circuit Breaker evitó llamar a la función que falla
    expect(directFallback.isDegraded).toBe(true);
    expect(directFallback.result.fallbackFromCircuitBreaker).toBe(true);
  });
});
