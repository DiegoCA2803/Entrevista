import { describe, it, expect } from 'vitest';
import { DIContainer, TOKENS } from '../core/container/container.js';
import { bootstrapContainer } from '../core/container/bootstrap.js';
import { resetRepositoriesForTesting } from '../repositories/db.js';
import { EquipmentService } from '../services/equipment.service.js';
import { ApiController } from '../controllers/api.controller.js';

describe('Inyección de Dependencias (IoC Container & SOLID)', () => {
  it('Registra y resuelve dependencias simples y singleton', () => {
    const container = new DIContainer();
    const mockService = { name: 'MockService' };

    container.register('MockToken', mockService);
    const resolved = container.resolve<typeof mockService>('MockToken');

    expect(resolved).toBe(mockService);
    expect(resolved.name).toBe('MockService');
  });

  it('Resuelve dependencias mediante fábricas de forma perezosa (Lazy Factory)', () => {
    const container = new DIContainer();
    let factoryInvocations = 0;

    container.registerFactory('ServiceFactory', () => {
      factoryInvocations++;
      return { id: Math.random() };
    }, true);

    expect(factoryInvocations).toBe(0);

    const first = container.resolve<{ id: number }>('ServiceFactory');
    const second = container.resolve<{ id: number }>('ServiceFactory');

    expect(factoryInvocations).toBe(1); // Singleton: se construye una sola vez
    expect(first.id).toBe(second.id);
  });

  it('Lanza error explicativo si se intenta resolver un token no registrado', () => {
    const container = new DIContainer();
    expect(() => container.resolve('TokenInexistente')).toThrow(
      '[DI Container] Dependencia no registrada para el token: "TokenInexistente".'
    );
  });

  it('bootstrapContainer configura e inyecta el grafo completo de servicios y controladores', async () => {
    const repos = resetRepositoriesForTesting();
    const container = await bootstrapContainer(repos);

    const eqService = container.resolve<EquipmentService>(TOKENS.EquipmentService);
    const apiController = container.resolve<ApiController>(TOKENS.ApiController);

    expect(eqService).toBeInstanceOf(EquipmentService);
    expect(apiController).toBeInstanceOf(ApiController);
  });
});
