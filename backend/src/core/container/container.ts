/**
 * DIContainer: Contenedor Ligero y Tipado de Inversión de Control (IoC) e Inyección de Dependencias.
 * Facilita el desacoplamiento estricto según los principios SOLID (Dependency Inversion Principle),
 * permitiendo registrar y resolver componentes con soporte para instancias singleton o fábricas transitorias.
 */

export const TOKENS = {
  Repositories: Symbol('Repositories'),
  EquipmentService: Symbol('EquipmentService'),
  OperatorService: Symbol('OperatorService'),
  ShiftService: Symbol('ShiftService'),
  MaintenanceService: Symbol('MaintenanceService'),
  ProjectionService: Symbol('ProjectionService'),
  AuditService: Symbol('AuditService'),
  ApiController: Symbol('ApiController')
} as const;

export type Token = symbol | string;

export class DIContainer {
  private instances = new Map<Token, any>();
  private factories = new Map<Token, { factory: (c: DIContainer) => any; isSingleton: boolean }>();

  /**
   * Registra una instancia ya construida (Singleton explícito).
   */
  public register<T>(token: Token, instance: T): this {
    this.instances.set(token, instance);
    return this;
  }

  /**
   * Registra una fábrica de construcción diferida con resolución de dependencias.
   */
  public registerFactory<T>(
    token: Token,
    factory: (container: DIContainer) => T,
    isSingleton: boolean = true
  ): this {
    this.factories.set(token, { factory, isSingleton });
    return this;
  }

  /**
   * Resuelve una dependencia por su token.
   */
  public resolve<T>(token: Token): T {
    if (this.instances.has(token)) {
      return this.instances.get(token);
    }

    const factoryConfig = this.factories.get(token);
    if (!factoryConfig) {
      const tokenName = typeof token === 'symbol' ? token.description : token;
      throw new Error(`[DI Container] Dependencia no registrada para el token: "${tokenName}".`);
    }

    const instance = factoryConfig.factory(this);

    if (factoryConfig.isSingleton) {
      this.instances.set(token, instance);
    }

    return instance;
  }

  /**
   * Limpia el contenedor (útil para pruebas unitarias).
   */
  public clear(): void {
    this.instances.clear();
    this.factories.clear();
  }
}
