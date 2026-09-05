# Documento de Decisiones de Arquitectura y Negocio — MineFleet

**Proyecto:** Sistema de Control de Asignación de Equipos y Mantenimiento Minero  
**Autor:** Diego  
**Fecha:** Septiembre 2026  

---

## 1. Modelo de Datos y Sustento Relacional

### 1.1. Elección de Motor Relacional (PostgreSQL)
Para una operación minera de extracción y acarreo de mineral, la integridad referencial y la consistencia transaccional (ACID) no son negociables. Una asignación incorrecta puede desencadenar riesgos fatales de seguridad, paralización de líneas de carguío y sanciones regulatorias.

Se seleccionó **PostgreSQL** por:
1. **Consistencia Transaccional Estricta**: Permite transacciones con niveles de aislamiento que resuelven la concurrencia atómica.
2. **Restricciones de Integridad Compuestas**: Índices únicos compuestos como `UNIQUE(shift_id, equipment_id)` y `UNIQUE(shift_id, operator_id)` que delegan la garantía física de no duplicidad al motor relacional, eliminando condiciones de carrera (*race conditions*).
3. **Tipado y Precisión Numérica**: Uso de `NUMERIC(10,2)` para evitar errores de coma flotante en la acumulación de horómetros.

### 1.2. Entidades Principales y Relaciones
- **`equipment`**:
  - `id`: UUID (Clave primaria inmutable).
  - `code`: Identificador visible único (ej. `CAM-001`, `EXC-101`).
  - `type`: Enum de tipología de equipo (`CAMION_ACARREO`, `EXCAVADORA`, `PERFORADORA`, etc.).
  - `horometer`: Horas acumuladas de uso del equipo.
  - `maintenance_interval_hours`: Frecuencia del ciclo preventivo (por defecto 250h).
  - `last_maintenance_horometer`: Horómetro en el que se realizó el último mantenimiento (base del ciclo actual).
  - `status`: Estado operativo (`DISPONIBLE`, `BLOQUEADO`, `EN_MANTENIMIENTO`).
- **`operators`**:
  - `id`, `code`, `name`, `document_id` (DNI/Rut), `is_active`.
- **`certifications`**:
  - Clave foránea `operator_id` vinculada a `operators(id)`.
  - `equipment_type`: Tipo de equipo autorizado.
  - `issued_date` y `expiration_date`: Rango de vigencia de la acreditación técnica.
- **`shifts`**:
  - `id`, `code` (`TUR-YYYY-MM-DD-JORNADA`), `date`, `period` (`DIA` / `NOCHE`), `planned_duration_hours`, `actual_duration_hours`, `status` (`PROGRAMADO`, `EN_CURSO`, `CERRADO`, `CANCELADO`), `closed_at`, `closed_by`, `notes`.
- **`assignments`**:
  - Claves foráneas: `shift_id`, `equipment_id`, `operator_id`.
  - Restricciones únicas compuestas:
    - `CONSTRAINT uq_shift_equipment UNIQUE (shift_id, equipment_id)` (Regla 7).
    - `CONSTRAINT uq_shift_operator UNIQUE (shift_id, operator_id)` (Regla 6).
  - `status`: `PROGRAMADA`, `EN_RIESGO`, `COMPLETADA`, `CANCELADA`.
  - `is_override`, `override_by`, `override_reason`, `override_at`: Trazabilidad de excepciones de supervisor.
- **`maintenance_records`**:
  - Historial auditable: `equipment_id`, `date`, `horometer_at_maintenance`, `performed_by`, `notes`, `maintenance_type`.
- **`audit_logs`**:
  - Bitácora de eventos críticos (cierres de turno, overrides, cambios de estado).

---

## 2. Resolución de las Decisiones Abiertas del Negocio

### Decisión 1: Un equipo se bloquea a mitad de semana y ya tenía turnos programados para los días siguientes. ¿Qué pasa con esas asignaciones?
* **Criterio adoptado:** **No se cancelan silenciosamente; pasan al estado `"EN_RIESGO"` (*Flagged Risk*) y alertan al despachador.**
* **Sustento técnico y operativo:**
  - Cancelar automáticamente las asignaciones destruiría la planificación operativa de la mina y dejaría al operador asignado "en el aire" sin previo aviso ni reubicación.
  - Al cerrar un turno que dispara el bloqueo de un equipo, el sistema busca automáticamente todas las asignaciones futuras de ese equipo (`date >= shift_date`) y las actualiza a `status = 'EN_RIESGO'` con el motivo descriptivo: `"Equipo bloqueado por superar umbral en turno X (254h). Requiere mantenimiento previo o reasignación."`
  - En la interfaz, estas asignaciones se tiñen de ámbar con badges parpadeantes. El despachador tiene dos opciones:
    1. Reasignar a otro equipo disponible del mismo tipo.
    2. Mantener la asignación si el taller ingresa el equipo a mantenimiento preventivo antes de ese turno (al registrar el mantenimiento, el sistema automáticamente restaura las asignaciones de `"EN_RIESGO"` a `"PROGRAMADA"`).

---

### Decisión 2: ¿Se puede forzar una asignación con autorización de un supervisor? Si permites la excepción, ¿cómo queda registrada?
* **Criterio adoptado:** **Sí se permite, pero bajo estricta auditoría de seguridad minera y con justificación no trivial.**
* **Sustento técnico y operativo:**
  - En una operación minera real existen contingencias críticas (ej. desprendimiento de talud o necesidad de mover un equipo para liberar un carril de emergencia) donde la jefatura de guardia asume la responsabilidad de operar un equipo bloqueado por horas de mantenimiento o un operador en proceso de revalidación.
  - **Límites de la excepción:** **No se permite override por colisión física** (un equipo u operador no puede clonarse para estar en dos lugares en el mismo turno; las reglas 6 y 7 son inviolables físicamente).
  - **Registro:** Se exige el código/identificador del supervisor (`override_by`) y una justificación textual explicativa obligatoria de al menos 10 caracteres (`override_reason`).
  - La asignación se persiste con `is_override = true`, fecha y hora de la excepción (`override_at`), y genera un registro inmutable en la tabla `audit_logs` que se visualiza con un badge rojo de "Excepción de Supervisor" en toda la interfaz.

---

### Decisión 3: El mantenimiento se hizo 30 horas después del umbral. ¿El siguiente ciclo se cuenta desde el umbral o desde el horómetro real?
* **Criterio adoptado:** **Se cuenta desde el HORÓMETRO REAL al momento del servicio (`horometer_at_maintenance`).**
* **Sustento de ingeniería de confiabilidad (RCM / Reliability Centered Maintenance):**
  - Si un equipo con ciclo de 250 horas recibe su mantenimiento preventivo a las 280 horas (30h de desfase), en ese momento se cambian aceites de motor, fluidos hidráulicos, filtros y piezas de desgaste.
  - **Los fluidos y piezas nuevas tienen una vida útil nominal calibrada a partir de su instalación a las 280 horas.**
  - Si el siguiente mantenimiento se programara a las 500h (contando desde el umbral teórico de 250h), el equipo entraría al taller habiendo operado solo **220 horas reales** (500 - 280), desechando fluidos aún útiles, generando sobrecostos de lubricantes y provocando una indisponibilidad injustificada de la flota.
  - Por ello, el sistema almacena `last_maintenance_horometer = 280` y fija el próximo umbral en `280 + 250 = 530h`. Esto refleja la realidad física del activo.

---

### Decisión 4: El turno se cerró con más o menos horas de las planificadas. ¿Cómo lo manejas?
* **Criterio adoptado:** **Se capturan las horas efectivamente trabajadas (`actual_duration_hours`) al momento del cierre formal del turno.**
* **Sustento técnico y operativo:**
  - En minería las condiciones climáticas (lluvia, neblina), voladuras o fallas eléctricas alteran la duración de la jornada efectiva.
  - Al cerrar el turno, el modal solicita las `actual_hours` (validando $0 \le \text{horas} \le 24$).
  - Son estas horas reales (no las teóricas planificadas) las que se suman al horómetro del equipo. Si se planificaron 8h pero solo se trabajaron 6h por tronadura, se suman 6h. Si hubo sobretiempo y se trabajaron 10h, se suman 10h, lo que podría adelantar el bloqueo.

---

### Decisión 5: Una certificación vence a mitad de un turno ya programado a futuro. ¿Qué haces?
* **Criterio adoptado:** **Se valida contra la fecha del turno y la totalidad de la jornada. Si vence antes de la conclusión del turno, se rechaza la asignación regular.**
* **Sustento normativo y de seguridad (MSHA / D.S. 024-2016-EM):**
  - Operar un equipo pesado con una certificación que expira durante el turno infringe las normas de seguridad minera y expone a la compañía a responsabilidades legales y pérdida de cobertura de seguros en caso de siniestro.
  - El sistema compara la fecha de vencimiento (`expiration_date`) con la fecha del turno programado (`shift.date`). Si `expiration_date < shift.date`, la asignación es rechazada preventivamente indicando la fecha exacta en que venció la credencial.

---

### Decisión 6: Concurrencia — Dos supervisores intentan asignar el mismo equipo al mismo turno al mismo tiempo. ¿Cómo se garantiza que no entren ambas?
* **Criterio adoptado:** **Garantía a nivel de base de datos relacional mediante restricciones de unicidad compuestas atómicas y transacciones ACID.**
* **Sustento técnico:**
  - Las validaciones a nivel de software (*in-memory checks*) son propensas a colisiones cuando dos peticiones HTTP ocurren en hilos o instancias concurrentes en la misma fracción de milisegundo (*Check-Then-Act race condition*).
  - En el esquema relacional se declararon restricciones únicas a nivel de base de datos:
    ```sql
    CONSTRAINT uq_shift_equipment UNIQUE (shift_id, equipment_id);
    CONSTRAINT uq_shift_operator UNIQUE (shift_id, operator_id);
    ```
  - Cuando dos supervisores envían la solicitud en paralelo, la primera transacción adquiere el bloqueo de fila e inserta el registro; la segunda transacción es rechazada por el motor relacional disparando una violación de clave única.
  - El controlador de la API intercepta este error y responde de inmediato con un código HTTP `409 Conflict` y un mensaje claro: *"Conflicto de concurrencia: El recurso ya fue asignado en este turno por otro supervisor."*

---

## 3. Arquitectura en Capas y SOA con Degradación Elegante (*Graceful Degradation*)

Siguiendo las directrices del requerimiento, el sistema se estructuró en 4 capas estrictas con servicios desacoplados:

### 3.1. Capas del Sistema
1. **Dominio (`backend/src/domain/`)**: Entidades de negocio puras y contratos tipados. Sin dependencias externas.
2. **Repositorios / Acceso a Datos (`backend/src/repositories/`)**: Abstracción del almacenamiento con interfaces (`IEquipmentRepository`, `IOperatorRepository`, `IShiftRepository`, etc.). Permite alternar entre PostgreSQL en producción y un motor relacional en memoria para tests instantáneos.
3. **Servicios SOA (`backend/src/services/`)**: Módulos independientes por contexto delimitado:
   - `EquipmentService`
   - `OperatorService`
   - `ShiftService` (validación exhaustiva de reglas 5 a 11)
   - `MaintenanceService`
   - `ProjectionService` (Regla 12)
   - `AuditService`
4. **Controladores y Rutas API (`backend/src/controllers/`, `backend/src/routes/`)**: Manejo de peticiones HTTP REST, serialización y códigos de error semánticos.

### 3.2. Degradación Elegante (*Resilient Executor & Circuit Breaker*)
Para evitar que la caída o latencia de un servicio secundario interrumpa la operativa crítica de asignaciones y cierre de turnos:
- Se implementó `ResilientExecutor` en `backend/src/resilience/resilient-executor.ts`.
- Si el servicio analítico de **Proyección a 7 Días** o el servicio de **Auditoría** sufren alta latencia o fallos de infraestructura, el sistema:
  1. Registra el incidente e incrementa el contador de fallos.
  2. Activa un **Circuit Breaker** que cambia el estado a `DEGRADED` o `DOWN`.
  3. Ejecuta de forma transparente una acción de fallback (cálculo lineal seguro o respuesta en caché).
  4. Los servicios críticos del núcleo (asignación de recursos, cierre de turno, registro de mantenimientos) siguen operando al 100% sin interrupciones.
  5. La interfaz visualiza una alerta informativa de *"Modo de Degradación Elegante Activado"* con métricas de salud en `/api/health`.

### 3.3. Inyección de Dependencias (IoC Container) y Clean Code (SOLID)
Para garantizar la máxima mantenibilidad, testeabilidad y desacoplamiento del código:
1. **Contenedor IoC Tipado (`backend/src/core/container/container.ts`)**:
   - Implementación de un contenedor de inversión de control que gestiona el ciclo de vida de los componentes (fábricas perezosas y singletons).
   - Inversión de Dependencias estricta (DIP): Los módulos de alto nivel dependen de abstracciones e interfaces (`IEquipmentRepository`, `IShiftRepository`), no de implementaciones concretas.
   - Centralización en un **Composition Root** (`backend/src/core/container/bootstrap.ts`) que resuelve el grafo completo de dependencias en el arranque o durante los tests unitarios.
2. **Jerarquía de Errores de Dominio (`backend/src/core/errors/app-error.ts`)**:
   - Sustitución de `Error` genéricos por tipos semánticos: `NotFoundError` (404), `ConflictError` (409), `ValidationError` (400) y `BusinessRuleViolationError` (422).
   - `BusinessRuleViolationError` transporta el listado completo de violaciones de reglas de negocio para la **Regla 11**, permitiendo al frontend renderizar cada causa de forma estructurada.
3. **Manejo Centralizado de Errores (`backend/src/core/middleware/error.middleware.ts`)**:
   - Middleware de Express que captura excepciones no controladas y formatea respuestas HTTP con códigos de estado canónicos, eliminando la duplicación de bloques try/catch en los controladores.
4. **Constantes y Reglas de Negocio Desacopladas (`backend/src/core/constants/index.ts`)**:
   - Eliminación de números mágicos (umbrales de mantenimiento, límites de jornada, longitud mínima de justificación de supervisor) en un archivo centralizado de configuración.

---

## 4. Alcance, Trade-offs y Mejoras Futuras

### Qué se priorizó (El Núcleo Sólido):
1. Cumplimiento matemático y relacional de las 12 reglas obligatorias.
2. Validación multi-error acumulativa en asignaciones (Regla 11).
3. Simulación prospectiva a 7 días basada en turnos programados (Regla 12).
4. Pruebas automatizadas completas (10 tests unitarios y de resiliencia).
5. Contenedorización lista para despliegue con Docker y Docker Compose.
6. Facilidad de evaluación mediante el botón *"Reset Datos Demo"*.

### Qué se dejó fuera y qué se implementaría con más tiempo:
- **Telemetría IoT en Tiempo Real**: Conexión a buses CAN J1939 de los camiones para leer los horómetros directamente desde el ECM del motor sin intervención manual de despachadores.
- **Sincronización Offline (PWA con IndexedDB)**: En operaciones mineras a tajo abierto o subterráneas remotas sin cobertura 4G/WiFi constante, permitir que los despachadores asignen en una tablet local y los datos se sincronicen transaccionalmente al recuperar señal.
- **Optimización de Asignaciones con Algoritmos Genéticos o Programación Lineal**: Sugerir automáticamente el mejor emparejamiento operador-equipo maximizando la vida útil de la flota y minimizando el tiempo muerto.
- **Autenticación RBAC con JWT/OAuth2**: Roles diferenciados (Operador, Despachador, Supervisor de Guardia, Superintendente de Mantenimiento).

---

## 5. Declaración sobre el Uso de Inteligencia Artificial

De acuerdo con las instrucciones de la prueba:
- **Herramientas de IA utilizadas:** Antigravity / Gemini 3.8 Flash como asistente de programación por pares (*pair programmer*).
- **Para qué se utilizó:**
  - Generación de la estructura inicial de tipos TypeScript y esquemas relacionales SQL.
  - Redacción rápida de casos de prueba unitarios en Vitest.
  - Sugerencia de componentes visuales en React + Tailwind CSS.
- **Sustento del desarrollador:**
  - Cada línea de código, regla de negocio, restricción de integridad relacional (`UNIQUE`, claves foráneas) y lógica de degradación elegante ha sido revisada, comprendida y verificada manualmente mediante ejecución de suites de pruebas locales y análisis de dependencias.
