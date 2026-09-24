"""BAP Contable 0.3 · desktop preview. Run: py app.py"""
import sqlite3
import tkinter as tk
from datetime import date
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
import core

BG='#edf2f7'; WHITE='#ffffff'; NAV='#10283f'; NAV2='#183853'; ACCENT='#188c9d'; TEXT='#1c3146'; MUTED='#64788c'


def fmt(value): return f'S/ {value/100:,.2f}'


class Field:
    def __init__(self, parent, label, width=22, values=None, initial=''):
        box=tk.Frame(parent,bg=WHITE)
        box.pack(side='left',padx=(0,13),pady=5)
        tk.Label(box,text=label,bg=WHITE,fg=MUTED,font=('Segoe UI',9)).pack(anchor='w')
        self.input=ttk.Combobox(box,width=width,values=values,state='readonly') if values else ttk.Entry(box,width=width)
        self.input.pack(pady=(5,0))
        if initial:
            if values: self.input.set(initial)
            else: self.input.insert(0,initial)
    def get(self): return self.input.get().strip()
    def clear(self):
        if isinstance(self.input,ttk.Combobox): self.input.set('')
        else: self.input.delete(0,'end')


class Window(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('BAP Contable · Gestión para estudios')
        self.geometry('1240x780')
        self.minsize(1070,680)
        self.configure(bg=BG)
        style=ttk.Style(self);style.theme_use('clam')
        style.configure('Treeview',font=('Segoe UI',10),rowheight=31,background=WHITE,fieldbackground=WHITE,foreground=TEXT,borderwidth=0)
        style.configure('Treeview.Heading',font=('Segoe UI',10,'bold'),background='#dce8ef',foreground=TEXT,padding=8)
        style.map('Treeview',background=[('selected','#d2eef0')],foreground=[('selected',TEXT)])
        style.configure('TEntry',padding=5);style.configure('TCombobox',padding=5)
        style.configure('TButton',font=('Segoe UI',9,'bold'),padding=7)
        self.company_id=None;self.page='Inicio';self.draft=[]
        self.sidebar=tk.Frame(self,bg=NAV,width=212);self.sidebar.pack(side='left',fill='y');self.sidebar.pack_propagate(False)
        tk.Label(self.sidebar,text='BAP',font=('Segoe UI',27,'bold'),bg=NAV,fg=WHITE).pack(anchor='w',padx=23,pady=(24,0))
        tk.Label(self.sidebar,text='C O N T A B L E',font=('Segoe UI',10,'bold'),bg=NAV,fg='#80d3d8').pack(anchor='w',padx=23,pady=(0,29))
        self.nav={}
        for label in ['Inicio','Empresas y terceros','Ventas','Compras','Tesorería','Asientos','Reportes','Configuración']:
            btn=tk.Button(self.sidebar,text='  '+label,anchor='w',relief='flat',bd=0,
                          font=('Segoe UI',10),bg=NAV,fg='#d7e6ee',activebackground=NAV2,
                          activeforeground=WHITE,cursor='hand2',padx=14,pady=12,
                          command=lambda x=label:self.show(x))
            btn.pack(fill='x',padx=9,pady=2);self.nav[label]=btn
        tk.Label(self.sidebar,text='VERSIÓN 0.3 · DEMO LOCAL',bg=NAV,fg='#8faabc',font=('Segoe UI',8)).pack(side='bottom',pady=17)
        self.main=tk.Frame(self,bg=BG);self.main.pack(side='left',fill='both',expand=True)
        top=tk.Frame(self.main,bg=WHITE,height=75);top.pack(fill='x');top.pack_propagate(False)
        self.title_label=tk.Label(top,text='',bg=WHITE,fg=TEXT,font=('Segoe UI',19,'bold'))
        self.title_label.pack(side='left',padx=26)
        self.company_combo=ttk.Combobox(top,state='readonly',width=39)
        self.company_combo.pack(side='right',padx=25)
        self.company_combo.bind('<<ComboboxSelected>>',self.select_company)
        self.content=tk.Frame(self.main,bg=BG);self.content.pack(fill='both',expand=True,padx=24,pady=18)
        self.footer=tk.Label(self.main,text='DEMO · Sin emisión electrónica ni conexión a SUNAT · Todos los comprobantes son borradores internos',
                             bg='#fdf2d9',fg='#6c531f',font=('Segoe UI',9),anchor='w',padx=20,pady=9)
        self.footer.pack(fill='x',side='bottom')
        self.reload_companies()

    def reload_companies(self,preferred=None):
        self.companies=core.companies()
        self.company_combo['values']=[f"{r['ruc']}  ·  {r['nombre']}" for r in self.companies]
        ids=[r['id'] for r in self.companies]
        index=ids.index(preferred) if preferred in ids else (ids.index(self.company_id) if self.company_id in ids else 0)
        self.company_combo.current(index);self.select_company()

    def select_company(self,event=None):
        self.company_id=self.companies[self.company_combo.current()]['id']
        self.draft=[];self.show(self.page)

    def show(self,page):
        self.page=page;self.title_label.config(text=page)
        for name,button in self.nav.items():button.config(bg=NAV2 if name==page else NAV,fg=WHITE if name==page else '#d7e6ee')
        for child in self.content.winfo_children():child.destroy()
        try:
            {'Inicio':self.home,'Empresas y terceros':self.entities,'Ventas':self.sales,
             'Compras':self.purchases,'Tesorería':self.treasury,'Asientos':self.journal,
             'Reportes':self.reports,'Configuración':self.settings}[page]()
        except Exception as e:
            messagebox.showerror('No se pudo abrir la pantalla',str(e))

    def card(self,title,subtitle=None):
        outer=tk.Frame(self.content,bg=WHITE,highlightbackground='#dfe7ee',highlightthickness=1)
        outer.pack(fill='x',pady=(0,14))
        tk.Label(outer,text=title,bg=WHITE,fg=TEXT,font=('Segoe UI',12,'bold')).pack(anchor='w',padx=18,pady=(14,1))
        if subtitle: tk.Label(outer,text=subtitle,bg=WHITE,fg=MUTED,font=('Segoe UI',9)).pack(anchor='w',padx=18)
        body=tk.Frame(outer,bg=WHITE);body.pack(fill='x',padx=18,pady=12)
        return body

    def button(self,parent,title,action):
        ttk.Button(parent,text=title,command=lambda:self.run(action)).pack(side='left',padx=(0,8),pady=7)

    def run(self,action):
        try: action()
        except (ValueError,sqlite3.Error,OSError) as e:messagebox.showerror('Revisa la operación',str(e))

    def table(self,columns,rows,widths=None):
        frame=tk.Frame(self.content,bg=WHITE,highlightbackground='#dfe7ee',highlightthickness=1)
        frame.pack(fill='both',expand=True)
        tree=ttk.Treeview(frame,columns=[x[0] for x in columns],show='headings',selectmode='browse')
        for i,(key,label) in enumerate(columns):
            tree.heading(key,text=label);tree.column(key,width=(widths or {}).get(key,120),anchor='w',minwidth=70)
        scroll=ttk.Scrollbar(frame,orient='vertical',command=tree.yview);tree.configure(yscrollcommand=scroll.set)
        tree.pack(side='left',fill='both',expand=True,padx=(10,0),pady=10);scroll.pack(side='right',fill='y',pady=10)
        for iid,values in rows:tree.insert('', 'end',iid=str(iid),values=values)
        return tree

    def party_picker(self,parent):
        rows=core.parties(self.company_id)
        f=Field(parent,'Tercero registrado',31,[f"{r['documento']} · {r['nombre']}" for r in rows])
        return f,rows

    def selected_party(self,picker,rows):
        idx=picker.input.current()
        if idx<0:raise ValueError('Registra y selecciona un tercero de la empresa actual.')
        return rows[idx]['id']

    def home(self):
        today=date.today();start=today.replace(day=1).isoformat()
        ops,moves=core.summary(self.company_id,start,today.isoformat())
        body=self.card('Resumen del mes',f"Del {start} al {today.isoformat()} · Datos de prueba")
        cards=[('Ventas',ops.get('VENTA',(0,0))[1]),('Compras',ops.get('COMPRA',(0,0))[1]),
               ('Ingresos',moves.get('INGRESO',0)),('Egresos',moves.get('EGRESO',0))]
        for label,amount in cards:
            box=tk.Frame(body,bg='#eaf5f6',padx=18,pady=12);box.pack(side='left',fill='x',expand=True,padx=5)
            tk.Label(box,text=label,bg='#eaf5f6',fg=MUTED,font=('Segoe UI',10)).pack(anchor='w')
            tk.Label(box,text=fmt(amount),bg='#eaf5f6',fg=NAV,font=('Segoe UI',17,'bold')).pack(anchor='w')
        self.table([('fecha','Fecha'),('tipo','Tipo'),('documento','Documento interno'),('tercero','Tercero'),('total','Total')],
                   [(r['id'],(r['fecha'],r['tipo'],r['documento'],r['contraparte'],fmt(r['total_centimos']))) for r in core.operations(self.company_id)[:15]],
                   {'tercero':230,'documento':165})

    def entities(self):
        a=self.card('Nueva empresa ficticia','Cada cliente conserva sus operaciones independientes.')
        code=Field(a,'Código DEMO-...',16);name=Field(a,'Razón social',35)
        self.button(a,'Crear empresa',lambda:(self.reload_companies(core.create_company(code.get(),name.get())),self.show('Empresas y terceros')))
        b=self.card('Nuevo tercero de la empresa seleccionada','El código es ficticio; aún no se consultan RUC ni DNI.')
        pcode=Field(b,'Código DEMO-...',16);pname=Field(b,'Nombre',35)
        self.button(b,'Guardar tercero',lambda:(core.create_party(self.company_id,pcode.get(),pname.get()),self.show('Empresas y terceros')))
        self.table([('doc','Identificador'),('name','Nombre')],
                   [(r['id'],(r['documento'],r['nombre'])) for r in core.parties(self.company_id)],{'name':350})

    def sales(self):
        a=self.card('Nuevo borrador de venta','Varios conceptos por borrador · montos ilustrativos · sin envío tributario.')
        party,rows=self.party_picker(a);when=Field(a,'Fecha',12,initial=date.today().isoformat());number=Field(a,'N.º interno DRAFT-...',20)
        b=self.card('Añadir línea')
        detail=Field(b,'Concepto',27);qty=Field(b,'Cantidad',9);price=Field(b,'Precio unitario S/',13)
        rate=Field(b,'Tasa ilustrativa',13,['0','18'],'18')
        self.button(b,'Añadir',lambda:self.add_draft(detail,qty,price,rate))
        c=self.card('Detalle acumulado')
        self.draft_label=tk.Label(c,text='',bg=WHITE,fg=TEXT,justify='left',anchor='w',font=('Segoe UI',10))
        self.draft_label.pack(fill='x');self.show_draft()
        self.button(c,'Descartar líneas',lambda:(self.draft.clear(),self.show_draft()))
        self.button(c,'Guardar borrador',lambda:self.save_sale(party,rows,when,number))
        tree=self.table([('fecha','Fecha'),('doc','Documento'),('party','Tercero'),('total','Total'),('state','Estado')],
                        [(r['id'],(r['fecha'],r['documento'],r['contraparte'],fmt(r['total_centimos']),r['estado']))
                         for r in core.operations(self.company_id,'VENTA')],{'party':220,'doc':150,'state':145})
        tree.bind('<Double-1>',lambda event:self.sale_detail(tree))

    def add_draft(self,detail,qty,price,rate):
        self.draft.append(core.line(detail.get(),qty.get(),price.get(),rate.get()))
        self.show_draft();detail.clear();qty.clear();price.clear()

    def show_draft(self):
        if not hasattr(self,'draft_label'):return
        lines=[f"{i+1}. {x['description']} · {x['quantity']} × {fmt(x['price'])} · impuesto ejemplo {fmt(x['tax'])} · total {fmt(x['base']+x['tax'])}"
               for i,x in enumerate(self.draft)]
        lines.append(f"TOTAL DEL BORRADOR: {fmt(sum(x['base']+x['tax'] for x in self.draft))}")
        self.draft_label.config(text='\n'.join(lines))

    def save_sale(self,party,rows,when,number):
        core.create_sale(self.company_id,self.selected_party(party,rows),when.get(),number.get(),self.draft)
        self.draft=[];self.show('Ventas')

    def sale_detail(self,tree):
        if not tree.selection():return
        rows=core.sale_lines(int(tree.selection()[0]),self.company_id)
        body='\n'.join(f"{r['descripcion']} · {r['cantidad']} × {fmt(r['precio_centimos'])} · base {fmt(r['base_centimos'])} · impuesto {fmt(r['impuesto_centimos'])}" for r in rows)
        messagebox.showinfo('Detalle del borrador',body or 'Registro heredado sin líneas desglosadas.')

    def purchases(self):
        a=self.card('Nueva compra interna','Se registra el total declarado por el usuario, sin validación tributaria automática.')
        party,rows=self.party_picker(a);when=Field(a,'Fecha',12,initial=date.today().isoformat());number=Field(a,'N.º interno DRAFT-...',18)
        b=self.card('Detalle de compra')
        desc=Field(b,'Concepto',35);total=Field(b,'Total S/',13)
        self.button(b,'Guardar borrador',lambda:(core.create_purchase(self.company_id,self.selected_party(party,rows),when.get(),number.get(),desc.get(),total.get()),self.show('Compras')))
        self.table([('fecha','Fecha'),('doc','Documento'),('party','Proveedor'),('desc','Concepto'),('total','Total')],
                   [(r['id'],(r['fecha'],r['documento'],r['contraparte'],r['detalle'] or 'Registro anterior',fmt(r['total_centimos'])))
                    for r in core.operations(self.company_id,'COMPRA')],{'party':190,'desc':210,'doc':150})

    def treasury(self):
        a=self.card('Nuevo movimiento','Selecciona una venta o compra para aplicar un pago parcial, o deja la operación vacía.')
        ops=core.operations(self.company_id)
        options=['Sin vincular']+[f"{r['id']} · {r['tipo']} · {r['documento']} · saldo {fmt(core.payment_balance(self.company_id,r['id']))}" for r in ops]
        selector=Field(a,'Operación',45,options,'Sin vincular');when=Field(a,'Fecha',12,initial=date.today().isoformat())
        b=self.card('Movimiento de caja o banco')
        kind=Field(b,'Tipo',11,['INGRESO','EGRESO'],'INGRESO');method=Field(b,'Medio',10,['BANCO','CAJA'],'BANCO')
        concept=Field(b,'Concepto',28);amount=Field(b,'Monto S/',13)
        def save():
            idx=selector.input.current();op_id=None if idx in (-1,0) else ops[idx-1]['id']
            core.add_movement(self.company_id,op_id,when.get(),kind.get(),concept.get(),method.get(),amount.get())
            self.show('Tesorería')
        self.button(b,'Registrar movimiento',save)
        self.table([('date','Fecha'),('type','Tipo'),('concept','Concepto'),('method','Medio'),('doc','Aplicado a'),('amount','Monto')],
                   [(r['id'],(r['fecha'],r['tipo'],r['concepto'],r['medio'],r['documento'] or '—',fmt(r['monto_centimos'])))
                    for r in core.movements(self.company_id)],{'concept':240,'doc':150})

    def journal(self):
        a=self.card('Asiento manual','Cuentas numéricas; requiere al menos dos líneas y debe igual a haber. Revisión explícita.')
        when=Field(a,'Fecha',12,initial=date.today().isoformat());memo=Field(a,'Glosa',42)
        b=self.card('Líneas del asiento')
        account=Field(b,'Cuenta',12);debit=Field(b,'Debe S/',14,initial='0');credit=Field(b,'Haber S/',14,initial='0')
        lines=[];label=tk.Label(b,text='Sin líneas',bg=WHITE,fg=MUTED);label.pack(side='left',padx=12)
        def add():
            lines.append((account.get(),debit.get(),credit.get()))
            label.config(text=f'{len(lines)} líneas añadidas');account.clear();debit.clear();credit.clear()
            debit.input.insert(0,'0');credit.input.insert(0,'0')
        self.button(b,'Añadir línea',add)
        self.button(b,'Guardar asiento',lambda:(core.create_entry(self.company_id,when.get(),memo.get(),lines),self.show('Asientos')))
        tree=self.table([('date','Fecha'),('memo','Glosa'),('debit','Debe'),('credit','Haber'),('status','Estado')],
                        [(r['id'],(r['fecha'],r['glosa'],fmt(r['debe']),fmt(r['haber']),r['estado']))
                         for r in core.entries(self.company_id)],{'memo':320})
        def review():
            if not tree.selection():raise ValueError('Selecciona un asiento para marcarlo revisado.')
            if messagebox.askyesno('Revisión contable','¿Marcar el asiento seleccionado como revisado?'):
                core.review_entry(self.company_id,int(tree.selection()[0]));self.show('Asientos')
        c=self.card('Revisión');self.button(c,'Marcar seleccionado como revisado',review)

    def reports(self):
        a=self.card('Resumen por periodo','Totales de documentos internos y movimientos registrados; no es declaración tributaria.')
        now=date.today();start=Field(a,'Desde',13,initial=now.replace(day=1).isoformat());end=Field(a,'Hasta',13,initial=now.isoformat())
        result=tk.Label(a,text='',bg=WHITE,fg=TEXT,font=('Segoe UI',11),justify='left');result.pack(side='left',padx=15)
        def generate():
            op,mov=core.summary(self.company_id,start.get(),end.get())
            result.config(text=f"Ventas: {op.get('VENTA',(0,0))[0]} · {fmt(op.get('VENTA',(0,0))[1])}\n"
                               f"Compras: {op.get('COMPRA',(0,0))[0]} · {fmt(op.get('COMPRA',(0,0))[1])}\n"
                               f"Ingresos: {fmt(mov.get('INGRESO',0))} · Egresos: {fmt(mov.get('EGRESO',0))}")
        self.button(a,'Calcular',generate)
        b=self.card('Exportar operaciones','CSV para revisión interna; no tiene formato SIRE.')
        self.button(b,'Exportar CSV',self.export)
        self.table([('date','Fecha'),('type','Tipo'),('doc','Documento'),('party','Tercero'),('amount','Total')],
                   [(r['id'],(r['fecha'],r['tipo'],r['documento'],r['contraparte'],fmt(r['total_centimos'])))
                    for r in core.operations(self.company_id)],{'party':240,'doc':160})

    def export(self):
        path=filedialog.asksaveasfilename(defaultextension='.csv',filetypes=[('CSV','*.csv')])
        if path:core.export_operations(self.company_id,path);messagebox.showinfo('Exportación','Archivo CSV guardado.')

    def settings(self):
        a=self.card('Respaldo de la base','Guarda una copia íntegra de todas las empresas y sus registros.')
        self.button(a,'Guardar respaldo SQLite',self.backup)
        b=self.card('Estado de integración SUNAT','La conexión tributaria necesita certificado, autorización del emisor y validación de los flujos reales.')
        tk.Label(b,text='DESHABILITADO EN ESTA VERSIÓN',bg=WHITE,fg='#a45d27',font=('Segoe UI',11,'bold')).pack(anchor='w')
        tk.Label(b,text='No se guardan credenciales SOL. No se generan XML oficiales ni CDR.',bg=WHITE,fg=MUTED).pack(anchor='w',pady=7)
        c=self.card('Ubicación de datos');tk.Label(c,text=str(core.DB),bg=WHITE,fg=TEXT).pack(anchor='w')

    def backup(self):
        path=filedialog.asksaveasfilename(defaultextension='.sqlite3',initialfile='BAP_Contable_respaldo.sqlite3',filetypes=[('SQLite','*.sqlite3')])
        if path:core.backup(path);messagebox.showinfo('Respaldo','Se creó el respaldo correctamente.')


if __name__=='__main__':
    core.initialize()
    Window().mainloop()
