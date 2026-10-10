# BAP Contable: evolución financiera y automatización

Revisión: 10/10/2026. Alcance: un estudio, cinco empresas de servicios, comercio y construcción, usuarios simultáneos y acceso remoto.

## Estado verificable

La demostración incorpora importación CSV de ventas en memoria con vista previa, detección de duplicados, bloqueo de conflictos y actualización del panel. XLSX, compras y persistencia quedan pendientes. También tiene cobranzas y escenario de caja con saldos ficticios, cobros parciales, antigüedad y alertas por reglas transparentes. Los documentos son borradores internos; los cobros y pagos son simulados. Los cálculos usan centavos enteros y fechas UTC. No guarda información real ni representa contabilidad oficial. Navegación visual completa pendiente de revisión en navegador.

El piloto conectado tiene tablas, roles, permisos por empresa y auditoría de altas preparados. Sigue pendiente ejecutar el SQL en una base exclusiva y probar aislamiento, revocación, concurrencia y restauración. No ejecutar migraciones de Contable en proyectos de otros productos. Confirmar disponibilidad y presupuesto antes de conectar.

## Prioridades y criterios de aceptación

La propuesta comercial es reducir digitación, detectar pendientes antes del cierre y explicar la caja del cliente. Cada automatización conserva evidencia y responsable.

| Orden | Flujo | Automatización prevista | Prueba para aceptarla |
| --- | --- | --- | --- |
| 1 | Ventas/compras | Importación CSV/Excel, vista previa y detección de duplicados | Reimportar un lote no duplica registros; rechazos indican fila y causa |
| 1 | Cobros/pagos | Aplicación parcial y actualización transaccional de saldos | Dos usuarios no pueden aplicar más que el saldo; cobrado más pendiente coincide con total |
| 1 | Cobranzas/caja | Vencimientos y posibles faltantes de efectivo | No sumar cobros anteriores a caja inicial; proyección identifica déficit intermedio |
| 1 | Conciliación | Proponer coincidencias entre extracto y documentos | Cada movimiento se aplica una sola vez; coincidencia ambigua requiere aprobación |
| 2 | Cierre mensual | Tareas por empresa/período, responsables y documentos faltantes | Cierre bloquea cambios ordinarios; reapertura autorizada queda auditada |
| 2 | Honorarios/planes | Cuotas recurrentes y vencimientos de suscripción | Generación idempotente; cancelación detiene nuevas cuotas; pago tiene evidencia |
| 2 | Portal cliente | Documentos, observaciones y pendientes | Empresa A no accede a registros o archivos de B manipulando enlaces |
| 3 | Contabilidad | Plantillas de asientos y balance de comprobación | Debe = haber; asientos aprobados se corrigen por reversión trazable |
| 3 | CPE SUNAT | XML, firma servidor, envío, consulta y archivo CDR | Reintentos no generan otro comprobante; aceptación y rechazo son estados distintos |
| 3 | SIRE | Recuperar propuesta y comparar con registros internos | Diferencias trazables; contador revisa antes de generar/presentar |

Construcción requiere costos por obra, anticipos y valorizaciones; comercio requiere inventario y costo; servicios requiere contratos y recurrencia. El tratamiento tributario se valida por operación, no se infiere del sector.

## Arquitectura de automatización

- Toda consulta, archivo, evento y tarea tiene estudio/empresa/período y permisos verificados en servidor.
- Importes exactos y monedas separadas. Moneda extranjera requiere fuente/fecha del tipo de cambio y reglas validadas.
- Operación y evento de procesamiento se guardan juntos. Trabajos con clave única por empresa/tipo/período/documento, reintentos limitados y fallos visibles. Reintentar no duplica cobros, asientos ni comprobantes.
- Saldo y series concurrentes protegidos con bloqueo transaccional o control de versión; restricciones únicas y claves compuestas entre empresas.
- Listas paginadas y filtros por empresa/fecha; indicadores del período calculados en servidor. No presentar suma de una página como total del estudio.
- Auditoría de cambios, aprobaciones, reversos y exportaciones. No registrar secretos en logs.
- Archivos privados y enlaces temporales; certificados/secretos solo en servidor. MFA requiere interfaz y verificación de sesión, no solo una instrucción en README.
- Backup automático, copia independiente, restauración de base y archivos ensayada y responsable. Definir RPO/RTO con el piloto después de medir la recuperación.
- Avisos por correo/WhatsApp requieren integración, consentimiento y evidencia de entrega. Esta propuesta no envía mensajes a clientes.

Automatizar cálculos, validaciones, preparación y sugerencias. Conciliación ambigua, clasificación tributaria, cierre y presentación a SUNAT requieren aprobación autorizada. IA/OCR puede extraer documentos después: guardar evidencia, medir precisión y revisar antes de afectar registros; no es requisito de la primera venta ni recibe datos confidenciales por defecto.

SUNAT describe un flujo de emisión y respuesta CDR: un PDF o borrador no prueba aceptación. SIRE propone registros a partir de CPE y ofrece API; comparar/revisar es distinto de emitir. Fuentes oficiales: [SEE contribuyente](https://cpe.sunat.gob.pe/sistema_emision/see_contribuyente), [SIRE](https://cpe.sunat.gob.pe/node/139), [accesos SIRE](https://cpe.sunat.gob.pe/node/158), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Revalidar versiones y obligaciones al implementar.

## Venta y sostenibilidad

Separar licencia de software de servicios profesionales contables. Proponer implementación inicial y suscripción para estudio con cinco empresas, con límites explícitos de usuarios, archivos, soporte e integraciones. Empresas adicionales y migraciones se cotizan aparte. Cobro manual validado puede preceder a pasarela; no acreditar pago desde una respuesta del navegador.

Precio mínimo = costo mensual atribuible / (1 - margen bruto objetivo). Ejemplo de cálculo, no tarifa de mercado: costo S/ 240 y margen 40% requieren S/ 400 antes de impuestos y gastos no incluidos. Incluir infraestructura, backups, almacenamiento, mensajería, CPE, soporte y comisiones; contabilizar también el tiempo del fundador. Validar demanda y costo de atención antes de fijar precio.

Medir diez operaciones antes/después: tiempo de digitación, errores detectados, pendientes al cierre y horas de soporte. No prometer porcentajes de ahorro sin ensayo. Probar disposición a pagar con interesados y contrastar precio con ahorro observado.

## Hitos

1. Demostración financiera y pruebas de cálculo: implementadas en esta propuesta; revisión visual pendiente.
2. Base exclusiva, aislamiento de todos los roles, revocación y restauración: pendientes.
3. Importación CSV de ventas demostrable; persistencia segura, XLSX, compras, cobros/pagos y conciliación con concurrencia: pendientes.
4. Cierre y contabilidad con revisión profesional, contrato/privacidad/soporte: pendientes.
5. CPE/SIRE con certificados por emisor, entornos aplicables y pruebas de aceptación/rechazo: pendientes.

La incorporación de pantallas no habilita por sí sola el uso real. Cada hito conserva evidencia; distinguir demostración, prueba y operación real.
