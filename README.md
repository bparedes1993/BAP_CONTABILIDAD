# BAP Contable · versión de trabajo 0.3

Aplicación local para el flujo de un estudio contable con varios clientes. Incluye una interfaz con navegación lateral y módulos de inicio, empresas y terceros, ventas, compras, tesorería, asientos, reportes y configuración. **Los registros siguen siendo borradores internos ficticios; no se emiten comprobantes electrónicos.**

## Instalar y abrir en Windows 11

1. Extrae este ZIP en una carpeta propia, por ejemplo `Documentos\BAP_Contable_Profesional_0.3`. Evita ejecutar el programa dentro del ZIP.
2. Abre la carpeta en VS Code.
3. En **Terminal > Nuevo terminal**, confirma que estás en esa carpeta y ejecuta `py app.py`. Si `py` no funciona, ejecuta `python app.py`.
4. Necesitas Python 3.10 o posterior con Tkinter. No se instalan paquetes externos.
5. Si aparece un error, copia todo el mensaje de la terminal; la interfaz aún requiere una comprobación visual en Windows.

La base `bap_contable_demo.sqlite3` se crea al primer inicio en la misma carpeta. No abras dos instancias simultáneas. Usa **Configuración > Guardar respaldo SQLite** y guarda la copia en otra ubicación antes de actualizar.

## Migrar datos de 0.1 o 0.2

Con ambas aplicaciones cerradas, conserva una copia del archivo `bap_contable_demo.sqlite3` anterior. Cópialo dentro de la carpeta 0.3 **antes de ejecutar `app.py`**. El inicio añade las tablas y columnas nuevas y conserva operaciones, empresas y terceros. Los registros anteriores aparecen sin líneas desglosadas cuando no las tenían.

## Recorrido de prueba

1. Elige `DEMO-001` y abre **Empresas y terceros**. Registra un tercero `DEMO-CLIENTE`.
2. Abre **Ventas**; usa `DRAFT-F001-002`, fecha `AAAA-MM-DD` y añade una o más líneas. La tasa `18` solo calcula un ejemplo; `0` no calcula impuesto. Guarda el borrador.
3. En **Tesorería**, selecciona esa operación y registra un ingreso parcial; la aplicación impide superar el saldo.
4. En **Asientos**, añade dos líneas con la misma cifra al debe y al haber, guarda y luego marca el asiento como revisado.
5. En **Reportes**, consulta el periodo y exporta CSV. El CSV es un reporte interno, no un archivo oficial SIRE.
6. Cambia a `DEMO-002` para confirmar que no se muestran las operaciones de la otra empresa.

## Alcance y pendientes para operación real

Esta versión no guarda Clave SOL ni certificados y no genera XML UBL, firma digital, envío, CDR, boletas, notas, bajas, resúmenes diarios ni integración SIRE. No es apta para facturar o declarar impuestos. Tampoco calcula automáticamente detracciones, percepciones, retenciones ni regímenes especiales. Los asientos son manuales con validación de cuadre; sus cuentas no se contrastan todavía con el PCGE. Las compras registran un importe total ingresado por el usuario. No hay usuarios ni permisos ni edición multiusuario.

Para implementar emisión real se necesita seleccionar un contribuyente autorizado, acordar la modalidad SEE, obtener su certificado y credenciales de forma segura, definir series y casos tributarios con un contador, implementar XML/firma/envío/consulta de CDR y probar aceptación, rechazo, reintentos e idempotencia con la documentación vigente de SUNAT. No se deben entregar credenciales por chat ni incluirlas en el código o GitHub.

Documentación oficial: https://cpe.sunat.gob.pe/sistema_emision/see_contribuyente y https://cpe.sunat.gob.pe/guias-y-manuales
