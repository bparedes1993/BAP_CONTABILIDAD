"""Local accounting operations. All billing documents remain internal drafts."""
import csv
import re
import sqlite3
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

DB = Path(__file__).resolve().parent / 'bap_contable_demo.sqlite3'
CENT = Decimal('0.01')


def dec(value, positive=True):
    try:
        number = Decimal(str(value).strip().replace(',', '.'))
        if not number.is_finite() or (positive and number <= 0) or (not positive and number < 0):
            raise ValueError
        return number
    except (InvalidOperation, ValueError):
        raise ValueError('Importe o cantidad inválida.') from None


def cents(value, positive=True):
    return int((dec(value, positive) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def valid_date(value):
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise ValueError('Usa una fecha real con formato AAAA-MM-DD.') from None


def connection():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys = ON')
    con.execute('PRAGMA busy_timeout = 5000')
    return con


def initialize():
    with connection() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS empresas (
            id INTEGER PRIMARY KEY, ruc TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL,
            demo INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS operaciones (
            id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id),
            tipo TEXT NOT NULL CHECK(tipo IN ('VENTA','COMPRA')),
            fecha TEXT NOT NULL, contraparte TEXT NOT NULL, documento TEXT NOT NULL,
            total_centimos INTEGER NOT NULL CHECK(total_centimos > 0),
            estado TEXT NOT NULL DEFAULT 'BORRADOR DEMO' CHECK(estado='BORRADOR DEMO'),
            UNIQUE(empresa_id,tipo,documento)
        );
        CREATE TABLE IF NOT EXISTS terceros (
            id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id),
            nombre TEXT NOT NULL, documento TEXT NOT NULL, UNIQUE(empresa_id,documento),
            UNIQUE(id,empresa_id)
        );
        CREATE TABLE IF NOT EXISTS lineas (
            id INTEGER PRIMARY KEY, operacion_id INTEGER NOT NULL REFERENCES operaciones(id),
            descripcion TEXT NOT NULL, cantidad TEXT NOT NULL,
            precio_centimos INTEGER NOT NULL, base_centimos INTEGER NOT NULL,
            tasa TEXT NOT NULL, impuesto_centimos INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS movimientos (
            id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id),
            operacion_id INTEGER REFERENCES operaciones(id), fecha TEXT NOT NULL,
            tipo TEXT NOT NULL CHECK(tipo IN ('INGRESO','EGRESO')),
            concepto TEXT NOT NULL, medio TEXT NOT NULL,
            monto_centimos INTEGER NOT NULL CHECK(monto_centimos > 0)
        );
        CREATE TABLE IF NOT EXISTS asientos (
            id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id),
            fecha TEXT NOT NULL, glosa TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'BORRADOR'
                CHECK(estado IN ('BORRADOR','REVISADO'))
        );
        CREATE TABLE IF NOT EXISTS asiento_lineas (
            id INTEGER PRIMARY KEY, asiento_id INTEGER NOT NULL REFERENCES asientos(id),
            cuenta TEXT NOT NULL, debe_centimos INTEGER NOT NULL DEFAULT 0,
            haber_centimos INTEGER NOT NULL DEFAULT 0,
            CHECK(debe_centimos >= 0 AND haber_centimos >= 0),
            CHECK((debe_centimos > 0 AND haber_centimos = 0) OR
                  (debe_centimos = 0 AND haber_centimos > 0))
        );
        CREATE INDEX IF NOT EXISTS ix_operaciones_empresa_fecha ON operaciones(empresa_id,fecha);
        CREATE INDEX IF NOT EXISTS ix_movimientos_empresa_fecha ON movimientos(empresa_id,fecha);
        ''')
        existing = {row['name'] for row in con.execute('PRAGMA table_info(operaciones)')}
        for name, sql_type in [('cantidad','TEXT'),('precio_unitario','TEXT'),
                               ('igv_centimos','INTEGER'),('detalle','TEXT'),('tercero_id','INTEGER')]:
            if name not in existing:
                con.execute(f'ALTER TABLE operaciones ADD COLUMN {name} {sql_type}')
        for code, name in [('DEMO-001','Constructora Ejemplo S.A.C.'),
                           ('DEMO-002','Servicios Ejemplo E.I.R.L.')]:
            con.execute('INSERT OR IGNORE INTO empresas(ruc,nombre) VALUES (?,?)',(code,name))
        seed = [('DEMO-001','VENTA','Cliente de prueba A','DRAFT-F001-001',118000),
                ('DEMO-001','COMPRA','Proveedor de prueba A','DRAFT-C001-001',47200),
                ('DEMO-002','VENTA','Cliente de prueba B','DRAFT-F001-001',236000),
                ('DEMO-002','COMPRA','Proveedor de prueba B','DRAFT-C001-001',82600)]
        for company, kind, party, number, amount in seed:
            con.execute('''INSERT OR IGNORE INTO operaciones
                (empresa_id,tipo,fecha,contraparte,documento,total_centimos)
                SELECT id,?,?,?,?,? FROM empresas WHERE ruc=?''',
                (kind,date.today().isoformat(),party,number,amount,company))


def companies():
    with connection() as con:
        return con.execute('SELECT * FROM empresas ORDER BY nombre').fetchall()


def create_company(code, name):
    code, name = code.strip().upper(), name.strip()
    if not re.fullmatch(r'DEMO-[A-Z0-9-]{1,18}',code) or not name:
        raise ValueError('Usa un código ficticio DEMO-... y un nombre.')
    with connection() as con:
        return con.execute('INSERT INTO empresas(ruc,nombre) VALUES (?,?)',(code,name)).lastrowid


def parties(company_id):
    with connection() as con:
        return con.execute('SELECT * FROM terceros WHERE empresa_id=? ORDER BY nombre',(company_id,)).fetchall()


def create_party(company_id, code, name):
    code, name = code.strip().upper(), name.strip()
    if not re.fullmatch(r'DEMO-[A-Z0-9-]{1,18}',code) or not name:
        raise ValueError('Usa un documento ficticio DEMO-... y un nombre.')
    with connection() as con:
        return con.execute('INSERT INTO terceros(empresa_id,documento,nombre) VALUES (?,?,?)',
                           (company_id,code,name)).lastrowid


def line(description, quantity, unit, rate):
    description = description.strip()
    qty = dec(quantity)
    if not description or qty.as_tuple().exponent < -3:
        raise ValueError('Cada línea necesita concepto y cantidad positiva (hasta 3 decimales).')
    price = cents(unit)
    if rate not in ('0','18'):
        raise ValueError('Tasa de ejemplo inválida.')
    base = int((qty * price).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
    tax = int((Decimal(base) * Decimal(rate) / 100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
    return dict(description=description,quantity=str(qty),price=price,base=base,rate=rate,tax=tax)


def create_sale(company_id, party_id, when, number, items):
    when, number = valid_date(when), number.strip().upper()
    if not number.startswith('DRAFT-') or not items:
        raise ValueError('Usa un documento DRAFT-... y añade al menos una línea.')
    with connection() as con:
        party = con.execute('SELECT nombre FROM terceros WHERE id=? AND empresa_id=?',
                            (party_id,company_id)).fetchone()
        if party is None:
            raise ValueError('El tercero no pertenece a esta empresa.')
        total = sum(x['base']+x['tax'] for x in items)
        if total <= 0:
            raise ValueError('El total debe ser positivo.')
        cur = con.execute('''INSERT INTO operaciones
            (empresa_id,tipo,fecha,contraparte,documento,total_centimos,tercero_id,igv_centimos,detalle)
            VALUES (?,'VENTA',?,?,?,?,?,?,?)''',
            (company_id,when,party['nombre'],number,total,party_id,sum(x['tax'] for x in items),
             ' / '.join(x['description'] for x in items)))
        for item in items:
            con.execute('''INSERT INTO lineas
                (operacion_id,descripcion,cantidad,precio_centimos,base_centimos,tasa,impuesto_centimos)
                VALUES (?,?,?,?,?,?,?)''',
                (cur.lastrowid,item['description'],item['quantity'],item['price'],item['base'],item['rate'],item['tax']))
        return cur.lastrowid


def create_purchase(company_id, party_id, when, number, description, amount):
    when, number = valid_date(when),number.strip().upper()
    if not number.startswith('DRAFT-') or not description.strip():
        raise ValueError('Indica documento interno DRAFT-... y concepto.')
    with connection() as con:
        party = con.execute('SELECT nombre FROM terceros WHERE id=? AND empresa_id=?',
                            (party_id,company_id)).fetchone()
        if party is None:
            raise ValueError('El tercero no pertenece a esta empresa.')
        return con.execute('''INSERT INTO operaciones
            (empresa_id,tipo,fecha,contraparte,documento,total_centimos,tercero_id,detalle)
            VALUES (?,'COMPRA',?,?,?,?,?,?)''',
            (company_id,when,party['nombre'],number,cents(amount),party_id,description.strip())).lastrowid


def operations(company_id, kind=None):
    with connection() as con:
        if kind:
            return con.execute('SELECT * FROM operaciones WHERE empresa_id=? AND tipo=? ORDER BY fecha DESC,id DESC',
                               (company_id,kind)).fetchall()
        return con.execute('SELECT * FROM operaciones WHERE empresa_id=? ORDER BY fecha DESC,id DESC',
                           (company_id,)).fetchall()


def sale_lines(operation_id, company_id):
    with connection() as con:
        return con.execute('''SELECT l.* FROM lineas l JOIN operaciones o ON o.id=l.operacion_id
            WHERE o.id=? AND o.empresa_id=? ORDER BY l.id''',(operation_id,company_id)).fetchall()


def payment_balance(company_id, operation_id):
    with connection() as con:
        op = con.execute('SELECT total_centimos FROM operaciones WHERE id=? AND empresa_id=?',
                         (operation_id,company_id)).fetchone()
        if not op:
            raise ValueError('La operación no pertenece a esta empresa.')
        paid = con.execute('SELECT COALESCE(SUM(monto_centimos),0) FROM movimientos WHERE empresa_id=? AND operacion_id=?',
                           (company_id,operation_id)).fetchone()[0]
        return op['total_centimos']-paid


def add_movement(company_id, operation_id, when, kind, concept, method, amount):
    when = valid_date(when)
    amount = cents(amount)
    if kind not in ('INGRESO','EGRESO') or not concept.strip() or method not in ('BANCO','CAJA'):
        raise ValueError('Completa tipo, concepto y medio del movimiento.')
    with connection() as con:
        if operation_id is not None:
            op = con.execute('SELECT tipo,total_centimos FROM operaciones WHERE id=? AND empresa_id=?',
                             (operation_id,company_id)).fetchone()
            if op is None or (op['tipo']=='VENTA') != (kind=='INGRESO'):
                raise ValueError('El pago debe corresponder a una operación del mismo cliente y tipo.')
            paid = con.execute('SELECT COALESCE(SUM(monto_centimos),0) FROM movimientos WHERE empresa_id=? AND operacion_id=?',
                               (company_id,operation_id)).fetchone()[0]
            if paid+amount > op['total_centimos']:
                raise ValueError('El pago supera el saldo pendiente.')
        else:
            if not con.execute('SELECT 1 FROM empresas WHERE id=?',(company_id,)).fetchone():
                raise ValueError('Selecciona una empresa válida.')
        return con.execute('''INSERT INTO movimientos
            (empresa_id,operacion_id,fecha,tipo,concepto,medio,monto_centimos)
            VALUES (?,?,?,?,?,?,?)''',
            (company_id,operation_id,when,kind,concept.strip(),method,amount)).lastrowid


def movements(company_id):
    with connection() as con:
        return con.execute('''SELECT m.*,o.documento FROM movimientos m
            LEFT JOIN operaciones o ON o.id=m.operacion_id
            WHERE m.empresa_id=? ORDER BY m.fecha DESC,m.id DESC''',(company_id,)).fetchall()


def create_entry(company_id, when, memo, rows):
    when = valid_date(when)
    if not memo.strip() or len(rows)<2:
        raise ValueError('La glosa y al menos dos líneas son obligatorias.')
    debit = credit = 0
    normalized = []
    for account, d, c in rows:
        account = account.strip()
        d, c = cents(d,False),cents(c,False)
        if not re.fullmatch(r'[0-9]{2,12}',account) or (d>0)==(c>0):
            raise ValueError('Cada línea requiere cuenta numérica y monto solo al debe o al haber.')
        normalized.append((account,d,c))
        debit += d; credit += c
    if debit != credit:
        raise ValueError('El asiento no cuadra: debe y haber difieren.')
    with connection() as con:
        if not con.execute('SELECT 1 FROM empresas WHERE id=?',(company_id,)).fetchone():
            raise ValueError('Empresa inválida.')
        cur = con.execute('INSERT INTO asientos(empresa_id,fecha,glosa) VALUES (?,?,?)',
                          (company_id,when,memo.strip()))
        con.executemany('INSERT INTO asiento_lineas(asiento_id,cuenta,debe_centimos,haber_centimos) VALUES (?,?,?,?)',
                        [(cur.lastrowid,*x) for x in normalized])
        return cur.lastrowid


def entries(company_id):
    with connection() as con:
        return con.execute('''SELECT a.*,SUM(l.debe_centimos) debe,SUM(l.haber_centimos) haber
            FROM asientos a JOIN asiento_lineas l ON l.asiento_id=a.id
            WHERE a.empresa_id=? GROUP BY a.id ORDER BY a.fecha DESC,a.id DESC''',(company_id,)).fetchall()


def review_entry(company_id, entry_id):
    with connection() as con:
        cur = con.execute("UPDATE asientos SET estado='REVISADO' WHERE id=? AND empresa_id=? AND estado='BORRADOR'",
                          (entry_id,company_id))
        if cur.rowcount!=1:
            raise ValueError('Asiento inexistente o ya revisado.')


def summary(company_id, start, end):
    start,end=valid_date(start),valid_date(end)
    if start>end: raise ValueError('Periodo inválido.')
    with connection() as con:
        op=con.execute('''SELECT tipo,COUNT(*) cantidad,SUM(total_centimos) total FROM operaciones
            WHERE empresa_id=? AND fecha BETWEEN ? AND ? GROUP BY tipo''',(company_id,start,end)).fetchall()
        mov=con.execute('''SELECT tipo,SUM(monto_centimos) total FROM movimientos
            WHERE empresa_id=? AND fecha BETWEEN ? AND ? GROUP BY tipo''',(company_id,start,end)).fetchall()
    return ({r['tipo']:(r['cantidad'],r['total']) for r in op},
            {r['tipo']:r['total'] for r in mov})


def export_operations(company_id, destination):
    rows=operations(company_id)
    with open(destination,'w',encoding='utf-8-sig',newline='') as out:
        writer=csv.writer(out,delimiter=';')
        writer.writerow(['Tipo','Fecha','Tercero','Documento interno','Total S/','Estado'])
        for r in rows:
            writer.writerow([r['tipo'],r['fecha'],r['contraparte'],r['documento'],
                             f"{Decimal(r['total_centimos'])/100:.2f}",r['estado']])


def backup(destination):
    if Path(destination).resolve()==DB.resolve():
        raise ValueError('El respaldo debe tener otra ubicación.')
    with connection() as source, sqlite3.connect(destination) as target:
        source.backup(target)
