# BAP Contable · piloto web privado

Esta carpeta contiene una **primera base web utilizable con datos de prueba**, no un sistema de facturación electrónica. El repositorio público solo aloja código. Los datos del estudio deben permanecer en un proyecto privado de base de datos con acceso autenticado. La versión de escritorio 0.3 permanece en la raíz del repositorio como referencia y no se sincroniza con esta web.

## Demostración sin costo ni proyecto adicional

Abre `demo.html` desde un servidor local para recorrer cinco empresas ficticias de servicios, comercio y construcción. Desde la raíz del repositorio ejecuta `py -m http.server 8000 --directory web` en Windows o `python3 -m http.server 8000 --directory web` en otros sistemas; luego visita `http://localhost:8000/demo.html`. La demostración funciona sin Supabase y admite importaciones de prueba en memoria. No guarda datos de forma persistente; usar exclusivamente información ficticia. Los cálculos y nombres son ilustrativos. Se puede publicar como vista pública de producto, claramente identificada como demostración.

El usuario ya utiliza sus dos proyectos Free de Supabase para Control de Gastos y BAP Legal. Mantener ambos; posponer la creación del proyecto exclusivo de Contable hasta contar con presupuesto para un proyecto adicional. No ejecutar esta migración en ninguno de esos proyectos.

## Cobranzas y caja de demostración

### Importación CSV en memoria

La sección **Importar ventas** permite cargar el ejemplo para cualquier empresa, previsualizar filas y confirmar un lote ficticio. Soporta coma o punto y coma, BOM UTF-8 y campos entre comillas. Usa columnas `empresa,referencia,cliente,fecha_emision,fecha_vencimiento,base,impuesto,cobrado`, fechas AAAA-MM-DD e importes sin miles con hasta dos decimales. `impuesto` es un importe, no una tasa. Límite: 1 MB y 500 filas por archivo.

Duplicados iguales se omiten; datos diferentes bajo la misma referencia generan conflicto. Si hay errores o conflictos se bloquea todo el lote. Una empresa diferente a la seleccionada se rechaza. La referencia se normaliza a mayúsculas; no se sobrescriben registros. Al aplicar, resumen, directorio y cobranzas se actualizan. Cambiar de empresa cancela la vista previa; lecturas de archivos que terminan después de cambiar empresa se descartan.

Solo se usa memoria del navegador: al recargar se pierden los registros importados. El botón Restablecer vuelve a los registros iniciales de la empresa seleccionada. No se transmiten archivos a servidores ni se integra esta importación con Supabase. La plantilla descargable corresponde a DEMO-001; el botón Cargar ejemplo adapta el código a la empresa seleccionada. Usar solo datos ficticios. El período de corte permanece fijo en 10/10/2026.

Pruebas: `node --test web/tests/finance.test.mjs web/tests/import-sales.test.mjs`. La persistencia, validaciones servidor, auditoría de importaciones, permisos y concurrencia se implementarán antes del uso real. XLSX y compras quedan pendientes.

`demo.html` añade la sección **Cobranzas y caja**. Calcula saldo pendiente, vencidos y antigüedad tras cobros parciales ficticios; permite variar caja inicial y horizonte. El corte del ejemplo es 10/10/2026. No cuenta cobros vencidos como entradas futuras, carga pagos vencidos al inicio y detecta faltantes diarios aunque el cierre sea positivo. El saldo inicial incluye cobros anteriores. Las proyecciones suponen cobros futuros en fecha y no los garantizan.

Los borradores, cobros y compromisos de esta sección son simulados, no datos del piloto conectado. No hay mensajes automáticos, conciliación bancaria ni registros de pagos reales. El cálculo puro está en `finance.mjs`; sus pruebas se ejecutan con `node --test web/tests/finance.test.mjs`. La ruta comercial y de automatización está en `docs/EVOLUCION_CONTABLE.md` en la raíz del repositorio.

## Qué funciona

- Acceso con cuentas invitadas; sin formulario público de registro.
- Varias personas conectadas al mismo proyecto; roles iniciales admin, contador, auxiliar y lector.
- Un estudio con cinco empresas, con acceso por empresa según la membresía que asigne el administrador.
- Terceros, borradores de venta de varias líneas, consulta de importes y panel por empresa.
- Cálculo de venta y verificación de permisos en la base de datos. Ningún cliente puede escribir importes totales directamente.

**No hay conexión con SUNAT ni CDR, boleta, factura, nota, asientos, SIRE, archivos adjuntos o copias operativas automatizadas en este piloto.** La tasa 18% es solo un cálculo de prueba elegible para un concepto; un contador debe definir tratamientos reales antes de implementarlos. Compras, cobros y pagos se prueban en la demostración en memoria; la interfaz conectada aún no incorpora esos módulos.

## Compras, cobros y pagos con validaciones

En `demo.html`, abre **Compras y pagos**: registra una compra ficticia con base e impuesto expresados en soles; luego aplica un cobro o pago parcial. Solo admite importes positivos con hasta dos decimales, fechas no posteriores al corte y movimientos no anteriores al documento. Un importe superior al saldo se rechaza. Los reversos requieren motivo y conservan el original; solo se revierten movimientos de esta sesión. Cambiar empresa reinicia formularios. Todo se pierde al recargar.

El escenario de caja suma los cobros y resta los pagos registrados en esta sesión sobre la caja base. Los cobros/pagos históricos del ejemplo o CSV ya deben estar incluidos en esa caja base. Los movimientos nuevos reducen el saldo que se proyectará en el futuro; no se cuentan dos veces. Puede mostrar caja negativa: es una alerta de prueba, no una autorización bancaria.

`sql/003_purchases_settlements.sql` prepara compras y movimientos en PostgreSQL: escrituras solo por RPC, claves compuestas por empresa, saldos bajo bloqueo de fila, reintentos con clave única y comparación de datos, reversos auditados y membresía activa. Para cobros, pagos y reversos exige rol admin/contador **y sesión MFA AAL2**. El auxiliar puede preparar borradores pero no registrar dinero. La interfaz para enrolar/verificar MFA del aplicativo sigue pendiente; configurar MFA del panel Supabase no la sustituye.

Las migraciones 001/003 se ejecutaron en PostgreSQL WASM (PGlite) con Auth simulado, incluyendo pruebas de RLS. Eso no equivale a pruebas en Supabase real, PostgREST, JWT reales, restauración o sesiones simultáneas. No se conecta la demo a esas RPC ni se usa una service key para probar.

Para ejecutar validaciones desde la carpeta `web`: `npm ci`, luego `npm test`. Para el navegador: `npx playwright install chromium` y `npm run test:ui`. Node.js 20 o posterior. La prueba UI usa un servidor localhost temporal y solo datos ficticios. Un Chromium ya instalado puede indicarse mediante `CHROMIUM_EXECUTABLE_PATH`.

## Preparación segura, en orden

1. Cuando se vaya a habilitar un piloto conectado, crea un **proyecto Supabase nuevo y exclusivo** para BAP Contable. No reutilices las claves o la base de BAP Legal o BAP Control de Gastos. Esta etapa queda pendiente hasta aprobar el costo correspondiente.
2. En Supabase Auth desactiva el registro público y confirma el correo de los invitados. Crea o invita dos cuentas de prueba en **Authentication > Users**. Activa 2FA en la cuenta administradora del panel Supabase. Los usuarios del aplicativo necesitarán un flujo de enrolamiento/verificación MFA propio antes de utilizar dinero, aún pendiente de interfaz y prueba real.
3. En **SQL Editor**, ejecuta `sql/001_pilot.sql` una sola vez en el proyecto vacío y después `sql/003_purchases_settlements.sql`. Esta revisión de 001 incluye payload de solicitud y normalización de referencia; **no es una actualización para un proyecto que haya ejecutado una versión antigua de 001**. Si ya existe un piloto antiguo, preparar una migración de actualización después de inspeccionarlo; no borrar datos ni volver a ejecutar estas migraciones. No ejecutes SQL desconocido de terceros.
4. En **SQL Editor**, abre `sql/002_demo_seed.sql`, sustituye `CORREO_ADMIN_INVITADO` y `CORREO_LECTOR_INVITADO` por los correos de tus dos cuentas ficticias invitadas y ejecuta el archivo una sola vez. Crea cinco empresas, cinco terceros y asigna al administrador acceso a todas y al lector solo a `DEMO-001`. Si no encuentra a ambos usuarios, el bloque revierte todos los cambios. **No ejecutes también los INSERT manuales antiguos: el archivo ya incluye toda la preparación.**

Como alternativa para preparar una sola empresa manualmente, utiliza este ejemplo en un proyecto vacío después de la migración:

```sql
insert into public.studios(name) values ('Estudio BAP Piloto');
insert into public.companies(studio_id,name,reference_code,sector)
select id,'Empresa Ejemplo A','DEMO-001','servicios'
from public.studios where name='Estudio BAP Piloto';
insert into public.memberships(user_id,studio_id,company_id,role)
select u.id,s.id,null,'admin' from auth.users u cross join public.studios s
where u.email='CORREO_ADMIN_INVITADO' and s.name='Estudio BAP Piloto';
```

5. Solo si elegiste la preparación manual, agrega una membresía **lector** limitada a la empresa, con un correo distinto:

```sql
insert into public.memberships(user_id,studio_id,company_id,role)
select u.id,s.id,c.id,'lector' from auth.users u
join public.studios s on s.name='Estudio BAP Piloto'
join public.companies c on c.studio_id=s.id and c.reference_code='DEMO-001'
where u.email='CORREO_LECTOR_INVITADO';
```

6. Configura `config.js` con **Project URL** y **publishable key** del proyecto. La publishable key se publica en el navegador por diseño; **nunca** escribas allí una `service_role`, secret key, contraseña de base de datos, certificado o Clave SOL. No uses claves entregadas para otros proyectos.
7. Sirve la carpeta `web` por HTTPS. Para una vista previa local ejecuta `py -m http.server 8000 --directory web` desde la raíz del repositorio y visita `http://localhost:8000`. La vista previa no sustituye HTTPS para usuarios remotos. Cloudflare Pages admite publicación estática desde `web` y aplica el archivo `_headers`; no conectes el piloto a un dominio para clientes reales antes de validar seguridad y respaldo.
8. Registra una empresa, un tercero y una venta ficticios. Abre sesiones admin y lector en navegadores distintos. El lector solo debe ver su empresa; no debe poder crear terceros ni ventas. Repite con una segunda empresa y cambia de sesión.

Para ejecutar el chequeo automatizado de aislamiento, usa **las cinco empresas del archivo `002_demo_seed.sql`** y dos usuarios invitados como se indica arriba. En una terminal con Node.js 20 o posterior, define `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_READER_EMAIL` y `TEST_READER_PASSWORD` como variables de entorno **locales**, y ejecuta `node web/tests/security-smoke.mjs` desde la raíz. La prueba intenta accesos no autorizados y no debe ejecutarse con datos reales. Nunca pegues las contraseñas en GitHub o en un archivo compartido.

## Costos y retención

El plan Free de Supabase sirve para **pruebas con datos ficticios**: puede pausarse tras baja actividad y no incluye respaldo automático ni recuperación a un punto en el tiempo. Para información contable real, presupuestar como mínimo un plan con respaldos diarios y comprobar restauración; Supabase Pro figura desde USD 25/mes para un proyecto Micro, sujeto a límites y cambios de precio. Una copia independiente y pruebas de restauración siguen siendo necesarias. Cloudflare Pages puede alojar los archivos estáticos sin consumo de Functions; validar límites y el costo del dominio opcional al contratar. No prometas disponibilidad ni confidencialidad absoluta por el solo hecho de elegir proveedores conocidos.

## Antes de usar datos reales

- Ejecutar pruebas de aislamiento de empresas con dos usuarios, incluyendo consultas, inserciones y RPC; revisar las políticas con un especialista. La migración **no se ha ejecutado en un proyecto Supabase real desde este entorno**.
- Contrato de tratamiento de datos, política de privacidad, registro de accesos, retención y procedimiento de incidente conforme a la normativa peruana aplicable; revisión legal por asesor local.
- Backups automáticos en plan contratado, copia adicional controlada y restauración ensayada. Definir responsable y periodicidad.
- Rotación de credenciales, MFA, dispositivos administrados, revocación al salir del estudio, control de cambios, revisión de dependencias y alertas.
- Integración SUNAT posterior con certificado por emisor almacenado del lado servidor, flujo XML/firma/envío/CDR y validación de contador. Nunca desde el navegador.

Documentación: https://supabase.com/docs/guides/database/postgres/row-level-security · https://supabase.com/pricing · https://developers.cloudflare.com/pages/configuration/headers/ · https://cpe.sunat.gob.pe/guias-y-manuales

