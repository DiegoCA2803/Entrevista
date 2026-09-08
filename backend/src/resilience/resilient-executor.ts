/**
 * ResilientExecutor: Implementación de Circuit Breaker y Fallback para Arquitectura SOA.
 * Permite que los servicios del sistema degraden de manera elegante (Graceful Degradation)
 * cuando un servicio secundario (ej. Proyección analítica a 7 días, auditoría externa)
 * presenta alta latencia o fallos, sin tumbar las operaciones críticas del núcleo minero.
 */

export interface ServiceHealth {
  name: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  failureCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

export class ResilientExecutor {
  private static healthMap = new Map<string, ServiceHealth>();
  private static failureThreshold = 3;
  private static cooldownPeriodMs = 30000; // 30 segundos para probar reintento

  public static async executeWithFallback<T>(
    serviceName: string,
    primaryAction: () => Promise<T>,
    fallbackAction: (error: Error) => Promise<T> | T
  ): Promise<{ result: T; isDegraded: boolean; warning?: string }> {
    let health = this.healthMap.get(serviceName);
    if (!health) {
      health = {
        name: serviceName,
        status: 'HEALTHY',
        failureCount: 0
      };
      this.healthMap.set(serviceName, health);
    }

    const now = Date.now();

    // Circuit Breaker: Si el servicio ha fallado repetidamente y estamos en cooldown, usamos fallback directo
    if (
      health.status === 'DOWN' &&
      health.lastFailureTime &&
      now - health.lastFailureTime < this.cooldownPeriodMs
    ) {
      console.warn(
        `[SOA CircuitBreaker] Servicio "${serviceName}" en estado DOWN. Ejecutando fallback inmediato.`
      );
      try {
        const fallbackResult = await fallbackAction(
          new Error(`Servicio ${serviceName} temporalmente inhabilitado por fallos reiterados.`)
        );
        return {
          result: fallbackResult,
          isDegraded: true,
          warning: `Servicio ${serviceName} en degradación elegante (Circuit Breaker abierto).`
        };
      } catch (fallbackError: any) {
        throw new Error(
          `Fallo crítico: ni el servicio primario ni el fallback de ${serviceName} respondieron.`
        );
      }
    }

    try {
      const result = await primaryAction();
      health.status = 'HEALTHY';
      health.failureCount = 0;
      health.lastSuccessTime = now;
      return { result, isDegraded: false };
    } catch (err: any) {
      health.failureCount++;
      health.lastFailureTime = now;
      if (health.failureCount >= this.failureThreshold) {
        health.status = 'DOWN';
      } else {
        health.status = 'DEGRADED';
      }

      console.error(
        `[SOA Degradation] Fallo en servicio "${serviceName}" (intento fallido #${health.failureCount}): ${err.message}. Activando degradación elegante.`
      );

      try {
        const fallbackResult = await fallbackAction(err);
        return {
          result: fallbackResult,
          isDegraded: true,
          warning: `Servicio ${serviceName} degradado: ${err.message}`
        };
      } catch (fallbackError: any) {
        console.error(`[SOA Degradation] El fallback de "${serviceName}" también falló:`, fallbackError);
        throw err;
      }
    }
  }

  public static getServicesHealth(): ServiceHealth[] {
    return Array.from(this.healthMap.values());
  }

  public static resetService(serviceName: string): void {
    const health = this.healthMap.get(serviceName);
    if (health) {
      health.status = 'HEALTHY';
      health.failureCount = 0;
      health.lastFailureTime = undefined;
    }
  }
}
