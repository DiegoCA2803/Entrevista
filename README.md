# MineFleet — Sistema de Control de Asignación de Equipos y Mantenimiento Minero

Aplicación web integral desarrollada para resolver el control de asignaciones operativas en minería (camiones de acarreo, excavadoras, perforadoras), eliminando las fallas humanas de las hojas de cálculo tradicionales: asignaciones de equipos vencidos de mantenimiento, operadores sin acreditación y colisiones de recursos.

Diseñado bajo una **Arquitectura en Capas Orientada a Servicios (SOA) con Degradación Elegante (*Graceful Degradation*)**, persistencia relacional (**PostgreSQL**) y contenedorización con **Docker**.

---

## Características Principales y Cumplimiento de Reglas

1. **Gestión de Equipos y Horómetros (Reglas 1, 2 y 3)**:
   - Control de horómetro acumulado por equipo e intervalos de mantenimiento preventivo (PM-250h).
   - **Bloqueo automático** cuando el horómetro alcanza el umbral de servicio.
   - Desbloqueo y liberación mediante registro formal de mantenimiento, recalculando el siguiente ciclo a partir del **horómetro real de servicio** para preservar la vida útil de repuestos nuevos.
2. **Operadores y Certificaciones por Fecha de Turno (Reglas 4 y 9)**:
   - Validación estricta de certificaciones técnicas según el tipo de equipo y la fecha específica del turno.
3. **Turnos y Asignaciones (Reglas 5, 6, 7 y 8)**:
   - Vinculación atómica Operador + Equipo + Turno (Día/Noche).
   - **Garantía de Concurrencia**: Restricciones relacionales compuestas a nivel de base de datos (`UNIQUE(shift_id, equipment_id)` y `UNIQUE(shift_id, operator_id)`) y transacciones para impedir doble asignación simultánea.
4. **Cierre de Turnos y Acumulación Real (Regla 10)**:
   - Registro de horas efectivamente trabajadas (`actual_hours`).
   - Suma inmediata a los horómetros de los equipos asignados, disparando el bloqueo en vivo si se cruza el umbral y marcando turnos futuros en estado **"EN RIESGO"**.
5. **Trazabilidad Exhaustiva y Validación Multi-Error (Regla 11)**:
   - Si una asignación es rechazada por varias razones simultáneas (ej. equipo bloqueado + operador con certificación vencida), el sistema **retorna y visualiza TODAS las causas**.
6. **Proyección Analítica de Mantenimiento a 7 Días (Regla 12)**:
   - Simulación prospectiva del uso de la flota sumando las horas de los turnos programados para los próximos 7 días, detectando el día y la jornada exacta del cruce de umbral.
7. **Excepción con Autorización de Supervisor**:
   - Mecanismo de override auditado con código de supervisor y justificación obligatoria ($\ge 10$ caracteres).
8. **Inyección de Dependencias (IoC Container) y Clean Code**:
   - Contenedor de inversión de control tipado (`DIContainer`) y Composition Root para resolución desacoplada siguiendo principios SOLID.
   - Jerarquía de errores de dominio tipados (`NotFoundError`, `ValidationError`, `ConflictError`, `BusinessRuleViolationError`).
   - Middleware centralizado de gestión de errores y eliminación de código repetitivo.
9. **Degradación Elegante (SOA Resilience)**:
   - Circuit Breaker y fallback en servicios auxiliares (proyecciones complejas y analítica) para garantizar que las operaciones críticas del núcleo minero nunca se detengan ante fallos periféricos.

---

## Arquitectura del Sistema

```
                            [ Frontend SPA - React + Vite + Tailwind ]
                                                │
                                                ▼  REST API (HTTP / JSON)
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                           CAPA DE PRESENTACIÓN / API                         │
  │                   Express 5 Controllers & Routes (/api/*)                   │
  └─────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                             CAPA DE SERVICIOS (SOA)                          │
  │  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
  │  │   EquipmentService    │  │    OperatorService    │  │ MaintenanceSvc  │  │
  │  └───────────────────────┘  └───────────────────────┘  └─────────────────┘  │
  │  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
  │  │ ShiftAssignmentService│  │   ProjectionService   │  │  AuditService   │  │
  │  │  (Reglas 5-11 + Lock) │  │  (Graceful Fallback)  │  │ (Async Resilient│  │
  │  └───────────────────────┘  └───────────────────────┘  └─────────────────┘  │
  └─────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                           CAPA DE REPOSITORIOS (DAL)                        │
  │   IEquipmentRepo │ IOperatorRepo │ IShiftRepo │ IMaintenanceRepo            │
  └─────────────────────────────────────────────────────────────────────────────┘
                         │                                    │
                         ▼                                    ▼
       [ PostgreSQL (Producción / Docker) ]     [ Relational Memory Engine (Test/Dev) ]
```

---

## Cómo Levantarlo en Local

### Requisitos Previos
- **Node.js**: v20 o superior (recomendado v22)
- **npm**: v10 o superior
- **Docker** y **Docker Compose** (opcional, para ejecución con PostgreSQL)

---

### Opción A: Con Docker Compose (Entorno de Producción Completo)

Levanta la base de datos relacional PostgreSQL 16 y el contenedor de la aplicación:

```bash
docker-compose up --build
```

- La aplicación estará disponible de inmediato en: **`http://localhost:4000`**
- PostgreSQL estará activo en: `localhost:5432` con usuario `mine_user` y base `mine_fleet`.

---

### Opción B: Ejecución Rápida con npm (Zero-Config / Fallback Relacional)

Si no tienes Docker activo en este momento, puedes ejecutarlo directamente en tu máquina local. El sistema inicializará automáticamente el motor relacional en memoria con los datos de prueba precargados:

1. **Instalar dependencias y compilar:**
   ```bash
   npm install
   npm run --prefix frontend install
   npm run build
   ```

2. **Iniciar la aplicación:**
   ```bash
   npm start
   ```

3. **Abrir en tu navegador:**
   - **`http://localhost:4000`**

---

### Opción C: Modo Desarrollo (Hot Reload)

```bash
# Terminal 1: Backend en modo watch
npm run dev:backend

# Terminal 2: Frontend Vite
npm run dev:frontend
```
- Frontend: `http://localhost:3000` (con proxy automático al backend en `http://localhost:4000`)

---

##  Pruebas Automatizadas

El proyecto incluye una suite de pruebas automatizadas con **Vitest** que valida exhaustivamente las 12 reglas de negocio, concurrencia y degradación elegante:

```bash
npm test
```

### Casos de Prueba Incluidos:
- `Regla 1 y 2`: Bloqueo automático al alcanzar el intervalo de horómetro.
- `Regla 3`: Desbloqueo y recálculo de ciclo a partir del horómetro real.
- `Reglas 4 y 9`: Rechazo de operadores con certificación vencida en la fecha del turno.
- `Reglas 6 y 7`: Prevención de duplicidad de operadores y equipos en el mismo turno (concurrencia).
- `Regla 10`: Cierre de turno, suma de horas y disparo de bloqueo en vivo.
- `Regla 11`: Retorno simultáneo de **TODAS** las violaciones de reglas en una asignación rechazada.
- `Regla 12`: Proyección a 7 días de equipos que cruzarán su umbral según turnos programados.
- `Supervisor Override`: Auditoría y justificación obligatoria para forzar asignaciones.
- `Graceful Degradation`: Aislamiento de fallos y activación de fallback mediante Circuit Breaker.

---

## Datos de Prueba Precargados (Casos Borde)

Al iniciar por primera vez o al hacer clic en el botón superior **"Reset Datos Demo"**, la aplicación precarga los casos límite requeridos:

| Entidad / Caso | Código | Detalle del Caso Borde |
|---|---|---|
| **Equipo a punto de PM** | `CAM-001` | Horómetro en **246.0h** de un ciclo de 250h. Le restan solo **4h** de vida útil. |
| **Operador Cert. Vencida** | `OP-003` | Jorge Quispe: certificación para Excavadora y Camión **vencida hace 5 días**. |
| **Turno Crítico para Cierre** | `TUR-[HOY]-D` | Asignado con `CAM-001`. Al cerrarlo con 8h, elevará su horómetro a **254h** y disparará el bloqueo automático en vivo. |
| **Equipo Bloqueado** | `EXC-101` | Excavadora en 512h (bloqueada). Permite probar el registro de mantenimiento o la excepción de supervisor. |
| **Equipo en Taller** | `CRG-301` | Cargador frontal bajo estado `EN_MANTENIMIENTO`. |
| **Turnos Futuros (+1, +2, +3)** | `TUR-...` | Turnos programados que alimentan la **Proyección a 7 Días** (Regla 12). Uno de ellos tiene asignado a `CAM-001` para demostrar cómo pasa a **"EN RIESGO"** cuando se bloquea en el turno anterior. |

---

## Guía de Despliegue en la Nube

La aplicación está diseñada para ser desplegada en cualquier plataforma en la nube (Render, Railway, Fly.io, Vercel o VPS propia):

### Despliegue en Render / Railway:
1. Conectar el repositorio de GitHub.
2. Crear un servicio de base de datos **PostgreSQL**.
3. Crear un **Web Service**:
   - **Build Command**: `npm install && npm run --prefix frontend install && npm run build`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     - `DATABASE_URL`: URL de conexión de la base de datos PostgreSQL.
     - `NODE_ENV`: `production`
     - `PORT`: `4000` (o la variable `$PORT` asignada por el proveedor).
4. El backend compilará el frontend estático y lo servirá conjuntamente en el mismo puerto, requiriendo un único servicio web activo.
