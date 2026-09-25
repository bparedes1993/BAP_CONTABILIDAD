# BAP Contable · piloto web privado

Esta carpeta contiene una **primera base web utilizable con datos de prueba**, no un sistema de facturación electrónica. El repositorio público solo aloja código. Los datos del estudio deben permanecer en un proyecto privado de base de datos con acceso autenticado. La versión de escritorio 0.3 permanece en la raíz del repositorio como referencia y no se sincroniza con esta web.

## Demostración sin costo ni proyecto adicional

Abre `demo.html` desde un servidor local para recorrer cinco empresas ficticias de servicios, comercio y construcción. Desde la raíz del repositorio ejecuta `py -m http.server 8000 --directory web` en Windows o `python3 -m http.server 8000 --directory web` en otros sistemas; luego visita `http://localhost:8000/demo.html`. La demostración es de **solo lectura**, funciona sin Supabase, no almacena información ni permite ingresar datos reales. Los cálculos y nombres son ilustrativos. Se puede publicar como vista pública de producto, claramente identificada como demostración.

El usuario ya utiliza sus dos proyectos Free de Supabase para Control de Gastos y BAP Legal. Mantener ambos; posponer la creación del proyecto exclusivo de Contable hasta contar con presupuesto para un proyecto adicional. No ejecutar esta migración en ninguno de esos proyectos.

## Qué funciona

- Acceso con cuentas invitadas; sin formulario público de registro.
- Varias personas conectadas al mismo proyecto; roles iniciales admin, contador, auxiliar y lector.
- Un estudio con cinco empresas, con acceso por empresa según la membresía que asigne el administrador.
- Terceros, borradores de venta de varias líneas, consulta de importes y panel por empresa.
- Cálculo de venta y verificación de permisos en la base de datos. Ningún cliente puede escribir importes totales directamente.

**No hay conexión con SUNAT ni CDR, boleta, factura, nota, compras, asientos, SIRE, archivos adjuntos o copias operativas automatizadas en este piloto.** La tasa 18% es solo un cálculo de prueba elegible para un concepto; un contador debe definir tratamientos reales antes de implementarlos.

## Preparación segura, en orden

1. Cuando se vaya a habilitar un piloto conectado, crea un **proyecto Supabase nuevo y exclusivo** para BAP Contable. No reutilices las claves o la base de BAP Legal o BAP Control de Gastos. Esta etapa queda pendiente hasta aprobar el costo correspondiente.
2. En Supabase Auth desactiva el registro público de nuevos usuarios, confirma el correo para los invitados y configura MFA para los administradores. Crea o invita dos cuentas de prueba en **Authentication > Users** desde el panel. Activa MFA en las cuentas cuando corresponda.
3. En **SQL Editor**, ejecuta `sql/001_pilot.sql` una sola vez en el proyecto vacío. La migración crea las tablas y políticas. No ejecutes SQL desconocido de terceros.
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
