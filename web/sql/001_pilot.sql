-- BAP Contable pilot. Execute once in a NEW Supabase project.
-- No CPE emission. All sales remain internal drafts.
create table public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id),
  name text not null check (length(trim(name)) between 2 and 160),
  reference_code text not null check (length(trim(reference_code)) between 2 and 24),
  sector text not null check (sector in ('servicios','comercio','construccion')),
  created_at timestamptz not null default now(),
  unique (id, studio_id), unique (studio_id, reference_code)
);
create table public.memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  studio_id uuid not null references public.studios(id),
  company_id uuid,
  role text not null check (role in ('admin','contador','auxiliar','lector')),
  active boolean not null default true,
  primary key (user_id, studio_id),
  foreign key (company_id, studio_id) references public.companies(id, studio_id)
);
create index memberships_studio_user_idx on public.memberships (studio_id,user_id) where active;
create table public.counterparties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  reference_code text not null check (length(trim(reference_code)) between 2 and 24),
  name text not null check (length(trim(name)) between 2 and 160),
  created_at timestamptz not null default now(),
  unique (id,company_id), unique (company_id,reference_code)
);
create index counterparties_company_idx on public.counterparties(company_id);
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  counterparty_id uuid not null,
  request_id uuid not null,
  reference text not null check (length(trim(reference)) between 2 and 50),
  issued_on date not null,
  status text not null default 'BORRADOR INTERNO' check (status = 'BORRADOR INTERNO'),
  base_amount numeric(16,2) not null check (base_amount > 0),
  example_tax numeric(16,2) not null check (example_tax >= 0),
  total_amount numeric(16,2) not null check (total_amount = base_amount + example_tax),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (counterparty_id,company_id) references public.counterparties(id,company_id),
  unique(company_id,reference), unique(company_id,request_id), unique(id,company_id)
);
create index sales_company_date_idx on public.sales(company_id,issued_on desc);
create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  company_id uuid not null,
  description text not null check (length(trim(description)) between 2 and 300),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(16,2) not null check (unit_price > 0),
  base_amount numeric(16,2) not null check (base_amount > 0),
  example_tax_rate numeric(5,2) not null check (example_tax_rate in (0,18)),
  example_tax numeric(16,2) not null check (example_tax >= 0),
  foreign key(sale_id,company_id) references public.sales(id,company_id)
);
create index sale_lines_sale_idx on public.sale_lines(sale_id);
create table public.audit_events (
  id bigint generated always as identity primary key,
  studio_id uuid not null references public.studios(id),
  company_id uuid references public.companies(id),
  actor uuid references auth.users(id),
  entity text not null, entity_id uuid not null, action text not null,
  created_at timestamptz not null default now()
);
create index audit_studio_created_idx on public.audit_events(studio_id,created_at desc);

-- SECURITY DEFINER helpers read membership without recursive RLS policies.
create function public.can_read_company(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.companies c on c.studio_id=m.studio_id
    where c.id=p_company and m.user_id=(select auth.uid()) and m.active
      and (m.company_id is null or m.company_id=c.id)
  );
$$;
create function public.can_write_company(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.companies c on c.studio_id=m.studio_id
    where c.id=p_company and m.user_id=(select auth.uid()) and m.active
      and (m.company_id is null or m.company_id=c.id)
      and m.role in ('admin','contador','auxiliar')
  );
$$;
create function public.can_admin_studio(p_studio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m where m.studio_id=p_studio
    and m.user_id=(select auth.uid()) and m.active and m.role='admin' and m.company_id is null
  );
$$;
revoke all on function public.can_read_company(uuid) from public,anon;
revoke all on function public.can_write_company(uuid) from public,anon;
revoke all on function public.can_admin_studio(uuid) from public,anon;
grant execute on function public.can_read_company(uuid),public.can_write_company(uuid),public.can_admin_studio(uuid) to authenticated;

alter table public.studios enable row level security;
alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.counterparties enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
alter table public.audit_events enable row level security;
create policy studio_read on public.studios for select to authenticated using (
  exists (select 1 from public.memberships m where m.studio_id=id and m.user_id=(select auth.uid()) and m.active)
);
create policy membership_self on public.memberships for select to authenticated using (user_id=(select auth.uid()) and active);
create policy company_read on public.companies for select to authenticated using ((select public.can_read_company(id)));
create policy company_insert on public.companies for insert to authenticated with check ((select public.can_admin_studio(studio_id)));
create policy party_read on public.counterparties for select to authenticated using ((select public.can_read_company(company_id)));
create policy party_insert on public.counterparties for insert to authenticated with check ((select public.can_write_company(company_id)));
create policy sale_read on public.sales for select to authenticated using ((select public.can_read_company(company_id)));
create policy line_read on public.sale_lines for select to authenticated using ((select public.can_read_company(company_id)));
create policy audit_admin_read on public.audit_events for select to authenticated using ((select public.can_admin_studio(studio_id)));
create function public.record_audit_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_studio uuid; v_company uuid;
begin
  if tg_table_name='companies' then v_studio:=new.studio_id;v_company:=new.id;
  else
    v_company:=new.company_id;
    select studio_id into v_studio from public.companies where id=v_company;
  end if;
  insert into public.audit_events(studio_id,company_id,actor,entity,entity_id,action)
  values(v_studio,v_company,auth.uid(),tg_table_name,new.id,tg_op);
  return new;
end;
$$;
revoke all on function public.record_audit_event() from public,anon,authenticated;
create trigger audit_company_created after insert on public.companies
for each row execute function public.record_audit_event();
create trigger audit_party_created after insert on public.counterparties
for each row execute function public.record_audit_event();
create trigger audit_sale_created after insert on public.sales
for each row execute function public.record_audit_event();
-- No client insert/update/delete on sales or lines. The RPC validates and calculates on the server.
revoke all on public.studios,public.companies,public.memberships,public.counterparties,public.sales,public.sale_lines,public.audit_events from anon;
revoke all on public.studios,public.companies,public.memberships,public.counterparties,public.sales,public.sale_lines,public.audit_events from authenticated;
grant select on public.studios,public.companies,public.memberships,public.counterparties,public.sales,public.sale_lines,public.audit_events to authenticated;
grant insert on public.companies,public.counterparties to authenticated;

create function public.create_sale_draft(
  p_company uuid,p_counterparty uuid,p_request uuid,p_reference text,p_date date,p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  item jsonb; v_sale uuid; v_base numeric(16,2):=0; v_tax numeric(16,2):=0;
  v_qty numeric; v_price numeric; v_rate numeric; v_line_base numeric; v_line_tax numeric;
begin
  if not public.can_write_company(p_company) then raise exception 'Acceso denegado'; end if;
  if not exists(select 1 from public.counterparties where id=p_counterparty and company_id=p_company) then
    raise exception 'Tercero no pertenece a la empresa'; end if;
  if p_request is null or p_date is null or length(trim(coalesce(p_reference,''))) not between 2 and 50
      or p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 50 then
    raise exception 'Borrador incompleto'; end if;
  select id into v_sale from public.sales where company_id=p_company and request_id=p_request;
  if v_sale is not null then return v_sale; end if;
  -- Validate all lines before reserving the reference; the function executes in one transaction.
  for item in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(item)<>'object' or length(trim(coalesce(item->>'description',''))) not between 2 and 300 then
      raise exception 'Concepto inválido'; end if;
    v_qty := (item->>'quantity')::numeric; v_price := (item->>'unit_price')::numeric;
    v_rate := (item->>'example_tax_rate')::numeric;
    if v_qty is null or v_price is null or v_rate is null
       or v_qty::text in ('NaN','Infinity','-Infinity') or v_price::text in ('NaN','Infinity','-Infinity')
       or v_rate::text in ('NaN','Infinity','-Infinity') or v_qty<=0 or v_qty>999999999 or v_qty<>round(v_qty,3) or v_price<=0 or v_price>999999999999
       or v_price<>round(v_price,2) or v_rate not in (0,18) then raise exception 'Línea inválida'; end if;
    v_line_base:=round(v_qty*v_price,2); v_line_tax:=round(v_line_base*v_rate/100,2);
    v_base:=v_base+v_line_base; v_tax:=v_tax+v_line_tax;
    if v_base>99999999999999.99 or v_tax>99999999999999.99 or v_base+v_tax>99999999999999.99 then
      raise exception 'El total supera el límite permitido'; end if;
  end loop;
  insert into public.sales(company_id,counterparty_id,request_id,reference,issued_on,base_amount,example_tax,total_amount,created_by)
  values(p_company,p_counterparty,p_request,trim(p_reference),p_date,v_base,v_tax,v_base+v_tax,auth.uid()) returning id into v_sale;
  for item in select value from jsonb_array_elements(p_lines) loop
    v_qty:=(item->>'quantity')::numeric;v_price:=(item->>'unit_price')::numeric;v_rate:=(item->>'example_tax_rate')::numeric;
    v_line_base:=round(v_qty*v_price,2);v_line_tax:=round(v_line_base*v_rate/100,2);
    insert into public.sale_lines(sale_id,company_id,description,quantity,unit_price,base_amount,example_tax_rate,example_tax)
    values(v_sale,p_company,trim(item->>'description'),v_qty,v_price,v_line_base,v_rate,v_line_tax);
  end loop;
  return v_sale;
end;
$$;
revoke all on function public.create_sale_draft(uuid,uuid,uuid,text,date,jsonb) from public,anon;
grant execute on function public.create_sale_draft(uuid,uuid,uuid,text,date,jsonb) to authenticated;
