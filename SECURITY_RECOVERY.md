# Recuperación de seguridad de MindSpace

Estado al 7 de octubre de 2026. Esta rama es una etapa de contención y migración; no acredita cumplimiento normativo ni está lista para operar con pacientes.

## Contención aplicada en esta rama

- Firestore deniega por defecto y limita citas, pacientes e historias al profesional propietario autenticado.
- Se eliminó la lectura pública de citas y la escritura anónima de diarios de ánimo.
- El portal de pacientes deja de aceptar RUT/correo como prueba de identidad; limpia las credenciales que guardaba en localStorage y muestra una pausa de servicio.
- El servidor limita el cuerpo JSON/URL-encoded y deja disponible únicamente `GET /api/health`. Las demás rutas API responden 503 durante la migración.
- La edición de reseñas conserva la propiedad original y la eliminación valida el documento existente.

## Funciones que siguen bloqueadas

La pausa de API deja temporalmente fuera de servicio reservas y cambios de citas, cobros Flow, recibos, IA/Gemini, firma de llamadas y pagos simulados. No usar la interfaz actual para atender pacientes, registrar evoluciones, cobrar ni gestionar urgencias. El bloqueo es intencional: las rutas antiguas no verifican de forma suficiente identidad, permisos, estado de pago o integridad de los datos.

## Hitos y criterios de salida

| Hito | Trabajo | Criterio para continuar |
|---|---|---|
| 0. Contención | Reglas estrictas, bloquear rutas inseguras y retirar la falsa autenticación del portal. | Reglas revisadas con pruebas que demuestren denegación por defecto y aislamiento entre pacientes/profesional. |
| 1. Identidad y acceso | Firebase Auth individual para profesional y pacientes; recuperación de cuenta; sesión con expiración; autorización por titular en servidor/reglas. | Pruebas negativas: RUT/correo ajenos, UID manipulado, enumeración y acceso entre pacientes no entregan información. |
| 2. Ficha clínica | Separar datos administrativos y clínicos; validación de esquema; bitácora inmutable de accesos/cambios; exportación, retención y procedimiento de incidentes. | Pruebas de permisos, trazabilidad, respaldo cifrado y recuperación documentada. |
| 3. Reservas y pagos | Reserva atómica en backend; tarifa desde configuración confiable; callback Flow con firma/verificación oficial e idempotencia; recibos con autorización. | Pruebas de repetición, monto alterado, cita ajena, callback falso y reembolso/conciliación. Sin documentos tributarios simulados. |
| 4. IA y videollamada | IA administrativa/clínica con consentimiento, minimización, controles de proveedor y retención; videollamada con proveedor real y credenciales efímeras. | Evaluación clínica/privacidad, control de acceso, borrado/retención y límites de uso; IA no sustituye juicio profesional. |
| 5. Validación | Construcción reproducible, análisis de dependencias/secrets, reglas emulator, pruebas de API y revisión de seguridad independiente. | CI verde y lista de defectos críticos/altos resuelta o aceptada formalmente. |
| 6. Railway staging | Variables de build/runtime, credencial Google restringida, proyecto Firestore correcto, dominio/TLS, logs sin datos clínicos y backups. | Pruebas de humo en staging con datos ficticios; restauración y rollback probados. |
| 7. Piloto | Consentimientos, protocolos clínicos/operativos y piloto controlado con datos reales solo tras validar obligaciones legales aplicables en Chile. | Responsable clínico y responsable de datos aprueban operación, respuesta a incidentes y continuidad. |

## Notas para Railway

- No desplegar esta rama como servicio de producción clínica. Las APIs están deliberadamente pausadas y la compilación todavía debe validarse.
- No subir secretos al repositorio ni al frontend. Las variables `VITE_*` quedan expuestas al navegador por diseño; solo deben contener configuración pública de Firebase.
- La aplicación usa Firebase en frontend y Firestore Admin SDK en servidor. Antes de staging se debe demostrar que ambos apuntan al mismo proyecto y base de datos, y usar una cuenta de servicio con privilegio mínimo.
- No configurar datos reales hasta probar las reglas en el emulador y verificar aislamiento entre cuentas.

Este documento es una lista de trabajo técnica, no una certificación de seguridad ni una interpretación legal. La revisión clínica, de privacidad y legal debe confirmar las obligaciones aplicables al caso concreto.
