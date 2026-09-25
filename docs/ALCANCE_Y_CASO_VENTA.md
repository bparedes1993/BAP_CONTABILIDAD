# BAP Contable — alcance y venta de referencia

**Estado:** especificación de trabajo; la aplicación 0.3 es una demo local y todavía no implementa este producto web.

## Cliente inicial y comercialización

Contadores independientes y estudios pequeños. Piloto: un estudio que administra cinco empresas de servicios, comercio y construcción, con varias personas conectadas simultáneamente dentro y fuera de la oficina. Modalidad propuesta: suscripción mensual por estudio; precio, límites de usuarios, volumen de comprobantes y soporte se fijarán tras el piloto. La posible prestación de servicios jurídicos y contables por BAP se evaluará como línea profesional separada con abogados y contadores responsables.

## Arquitectura

La demo Tkinter/SQLite no admite colaboración remota. No compartir su archivo de datos por OneDrive o una unidad de red. Para producción: aplicación web, API con autenticación y autorización por rol, PostgreSQL central, HTTPS, bitácora y respaldos probados. Toda consulta y cambio valida `estudio_id` y `empresa_id` en el servidor. Roles iniciales: administrador del estudio, contador revisor, auxiliar y lector de empresa. El certificado y las credenciales de un emisor no se guardan en el código ni en GitHub.

## Caso de venta ficticio para diseñar el sistema

Empresa A presta un servicio a Cliente B con RUC. Base S/ 1,000.00; **solo como supuesto del ejemplo**, impuesto 18% S/ 180.00; total S/ 1,180.00. Abono bancario parcial S/ 590.00; saldo S/ 590.00. Un contador decidirá el tratamiento real antes de utilizarlo con clientes. El 18% no debe asignarse por defecto a toda operación.

1. Auxiliar registra cliente, concepto, cantidad, precio, moneda y borrador.
2. Contador revisa cálculos y tratamiento; un usuario autorizado confirma. La numeración se reserva atómicamente por emisor, tipo y serie.
3. Se genera XML conforme a las guías vigentes, se firma con el certificado del emisor y se envía por la modalidad SEE seleccionada.
4. Se conserva solicitud, respuesta, CDR y estado. Ante respuesta incierta se consulta antes de reintentar, para evitar doble emisión. El PDF es representación legible.
5. Se registra cuenta por cobrar S/ 1,180.00, pago S/ 590.00 y saldo S/ 590.00. El contador revisa el asiento.
6. Cambios posteriores usan el documento o procedimiento aplicable, sin modificar el comprobante enviado.

Estados: borrador, en revisión, autorizado, en envío, aceptado, observado, rechazado y por verificar. Cada cambio conserva usuario, fecha y resultado. Un borrador no se presenta como comprobante emitido.

## Módulos y condiciones para producción

Usuarios, empresas, terceros, ventas y compras, facturas y boletas, notas, caja/bancos, cuentas por cobrar/pagar, plan contable parametrizable, asientos revisables, reportes, archivos y auditoría. Integración RVIE/RCE de SIRE después de estabilizar emisión CPE.

Antes de uso real: contador valida casos de los tres rubros; contribuyente piloto autoriza la modalidad y configura certificado/credenciales mediante canal seguro; se prueban permisos, concurrencia, aislamiento, restauración, XML, firma, CDR, rechazo, reintento, notas y SIRE. Ningún secreto o dato real se publica.

Referencias SUNAT: https://cpe.sunat.gob.pe/sistema_emision/see_contribuyente · https://cpe.sunat.gob.pe/guias-y-manuales · https://cpe.sunat.gob.pe/certificado-digital
