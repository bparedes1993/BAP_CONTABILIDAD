# BAP Contable: evidencia de validación

Fecha: 10/10/2026. Alcance de esta revisión: demostración ficticia y migraciones del piloto. No constituye certificación de seguridad ni autorización de uso con datos reales.

## Evidencia ejecutada

- PostgreSQL WASM local (PGlite 0.5.8): migraciones 001 y 003 ejecutadas, con esquema Auth y claims simulados. Se prueban consultas/RLS, permisos, operaciones RPC y reversos. El entorno no replica todos los servicios de Supabase ni permite acreditar concurrencia multiusuario real.
- 28 pruebas aprobadas de importación, antigüedad, proyección, compras, cobros/pagos, reversos y base de datos mediante `npm test` desde `web` (incluye el contenedor de subpruebas PostgreSQL).
- Chromium: carga, importación/reimportación, compra, rechazo de sobrepago, cobro, reverso, pago, cambio de empresa, etiqueta hostil inerte, navegación, disposición móvil a 390px y reinicio al recargar. La prueba detecta errores JavaScript y solicitudes externas del flujo de demostración.
- Auditoría npm del conjunto instalado: sin vulnerabilidades conocidas reportadas al ejecutar `npm audit` en esta revisión. Es una comprobación de advisories del lockfile de pruebas, no una auditoría independiente del producto ni de toda la cadena CDN de la versión conectada.

## Controles y estado

| Control | Evidencia local | Pendiente en entorno real |
| --- | --- | --- |
| Aislamiento estudio/empresa | RLS y claves compuestas; admin de A no ve B; lector solo ve su empresa | JWT reales y consultas PostgREST de todos los roles |
| Dinero por rol | Admin/contador; lector/auxiliar no registran dinero | Flujos reales de altas, bajas y cambios de rol |
| Segundo factor | RPC exige claim AAL2; AAL1 denegado en prueba | Interfaz de enrolamiento/desafío y prueba con Auth real |
| Saldo y decimales | Sobrepago, negativos, NaN y precisión inválida rechazados | Dos sesiones disputando el último saldo |
| Idempotencia | Claves únicas y comparación de payload; reintento exacto retorna original; cambio de datos rechazado | Timeout/reconexión y reintentos reales |
| Reversos | Conservan original, requieren motivo, ajustan saldo y generan auditoría | Revisión y segregación de aprobaciones del estudio |
| Escrituras directas | Sin INSERT/UPDATE/DELETE monetario para clientes; RPC validadas | Verificar grants reales después de cada despliegue |
| Revocación | Membresía inactiva niega inmediatamente nuevas consultas/RPC | Revocar sesiones y limpiar vistas/estado del cliente |
| Entrada de datos | Límites CSV, vista previa, duplicados y conflictos; textContent | Archivos privados, antivirus/tipo/tamaño para futuros adjuntos |
| TLS y navegador | CSP diseñada; demo sin llamadas externas en el recorrido | HTTPS, headers reales, dominio y revisión de dependencias conectadas |
| Respaldos | No operativos todavía | Copia independiente, restauración de datos/archivos, RPO/RTO medidos |
| Tributación | Solo registros internos y reglas ilustrativas | Validación contable, cierres, libros, CPE y SIRE |

## Regla de habilitación

El piloto conectado no está listo para información contable real. Antes de habilitarlo: proyecto exclusivo, Auth/MFA real, pruebas de todas las operaciones/roles, concurrencia de saldos, respaldo y restauración, manejo de errores/alertas y revisión del contador. Las funcionalidades de demo no equivalen a funcionalidades persistentes de la interfaz conectada.

No usar claves, certificados ni bases de otros productos BAP. No solicitar contraseñas, Clave SOL ni secret/service keys por chat o commit. Credenciales de emisor, cuando se implemente CPE, solo en servidor protegido.

Fuentes de diseño: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [funciones con permisos](https://supabase.com/docs/guides/database/functions), [MFA y AAL](https://supabase.com/docs/guides/auth/auth-mfa).
