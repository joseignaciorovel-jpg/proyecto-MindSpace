# Recuperación de seguridad de MindSpace

Estado al 7 de octubre de 2026. Esta rama es una etapa de contención y migración; no acredita cumplimiento normativo ni está lista para operar con pacientes.

## Contención aplicada en esta rama

- Firestore deniega por defecto y limita citas, pacientes e historias al único UID de profesional provisionado; una cuenta nueva no puede asignarse el rol desde el cliente.
- Se eliminó la lectura pública de citas y la escritura anónima de diarios de ánimo.
- El portal de pacientes deja de aceptar RUT/correo como prueba de identidad; limpia las credenciales que guardaba en localStorage y muestra una pausa de servicio.
- El servidor limita el cuerpo JSON/URL-encoded y deja disponible únicamente `GET /api/health`. Las demás rutas API responden 503 durante la migración.
- La edición de reseñas conserva la propiedad original y la eliminación valida el documento existente.
- Se quitó el permiso OAuth de Gmail del login, se borran tokens antiguos de `sessionStorage` y el envío de correos desde el navegador queda desactivado.

## Validación de esta rama

GitHub Actions pasó en Node 24: instalaciones reproducibles con `npm ci`, auditoría de dependencias principal y del paquete aislado de pruebas (0 avisos cada una), `npm run lint`, `npm run build`, siete pruebas de reglas en Firestore Emulator, construcción Docker y smoke test de API (`/api/health` 200; API heredada 503).

Las pruebas cubren aislamiento por propietario, denegación anónima y por defecto, acceso heredado limitado, reseñas con consentimiento, campos públicos minimizados de agenda, auditoría no editable desde cliente y bloqueo del autoaprovisionamiento de profesionales.

El emulador no sustituye pruebas de índices, configuración o comportamiento en una base real. No se han probado operaciones contra una base aislada. La autenticación individual de pacientes, la privacidad operacional, las copias/restauración y los flujos clínicos siguen sin validar. CI demuestra el cierre de las APIs heredadas, la compilación y estas propiedades concretas; no demuestra que el sistema esté listo para pacientes.

## Funciones que siguen bloqueadas

La pausa de API deja temporalmente fuera de servicio reservas y cambios de citas, cobros Flow, recibos, IA/Gemini, firma de llamadas y pagos simulados. El correo automático con Gmail también está pausado. No usar la interfaz actual para atender pacientes, registrar evoluciones, cobrar ni gestionar urgencias. Las rutas antiguas no verifican de forma suficiente identidad, permisos, estado de pago o integridad de los datos.

## Hitos y criterios de salida

| Hito | Trabajo | Criterio para continuar |
|---|---|---|
| 0. Contención | Reglas estrictas, bloquear rutas inseguras y retirar la falsa autenticación del portal. | **Validado en el emulador para los casos cubiertos;** ampliar pruebas al modelo completo antes de reabrir accesos. |
| 1. Identidad y acceso | Acceso del profesional limitado a un UID provisionado. Falta diseñar Firebase Auth individual para pacientes, recuperación de cuenta y vínculos paciente-profesional con autorización por titular. | Pruebas negativas: cuentas no provisionadas, RUT/correo ajenos, UID manipulado, enumeración y acceso entre pacientes no entregan información. |
| 2. Ficha clínica | Separar datos administrativos y clínicos; validación de esquema; bitácora inmutable de accesos/cambios; exportación, retención y procedimiento de incidentes. | Pruebas de permisos, trazabilidad, respaldo cifrado y recuperación documentada. |
| 3. Reservas y pagos | Reserva atómica en backend; tarifa desde configuración confiable; callback Flow con firma/verificación oficial e idempotencia; recibos con autorización. | Pruebas de repetición, monto alterado, cita ajena, callback falso y reembolso/conciliación. Sin documentos tributarios simulados. |
| 4. IA y videollamada | IA administrativa/clínica con consentimiento, minimización, controles de proveedor y retención; videollamada con proveedor real y credenciales efímeras. | Evaluación clínica/privacidad, control de acceso, borrado/retención y límites de uso; IA no sustituye juicio profesional. |
| 5. Validación | Construcción reproducible, análisis de dependencias/secrets, reglas emulator, pruebas de API y revisión de seguridad independiente. | CI verde y lista de defectos críticos/altos resuelta o aceptada formalmente. |
| 6. Railway staging | Variables de build/runtime, credencial Google restringida, proyecto Firestore correcto, dominio/TLS, logs sin datos clínicos y backups. | Pruebas de humo en staging con datos ficticios; restauración y rollback probados. |
| 7. Piloto | Consentimientos, protocolos clínicos/operativos y piloto controlado con datos reales solo tras validar obligaciones legales aplicables en Chile. | Responsable clínico y responsable de datos aprueban operación, respuesta a incidentes y continuidad. |

## Notas para Railway

- No desplegar esta rama como servicio de producción clínica. Las APIs están deliberadamente pausadas.
- El contenedor migra a Node.js 24 LTS; Node.js 20 llegó a fin de vida el 30 de abril de 2026.
- No subir secretos al repositorio ni al frontend. Las variables `VITE_*` quedan expuestas al navegador por diseño; solo deben contener configuración pública de Firebase.
- La aplicación usa Firebase en frontend y Firestore Admin SDK en servidor. Antes de staging se debe demostrar que ambos apuntan al mismo proyecto y base de datos, y usar una cuenta de servicio con privilegio mínimo.
- No configurar datos reales hasta completar identidad, pruebas de permisos por paciente y respaldo/restauración.

Este documento es una lista de trabajo técnica, no una certificación de seguridad ni una interpretación legal. La revisión clínica, de privacidad y legal debe confirmar las obligaciones aplicables al caso concreto.
