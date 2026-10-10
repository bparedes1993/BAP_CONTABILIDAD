-- Run after 001_pilot.sql, only in BAP Contable's exclusive test project.
-- Internal records, not fiscal CPE. No direct client money writes.
begin;
alter table public.sales add column settled_amount numeric(16,2) not null default 0
  check (settled_amount>=0 and settled_amount<=total_amount);
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  counterparty_id uuid not null,
  request_id uuid not null,
  reference text not null check(length(trim(reference)) between 2 and 50),
  issued_on date not null, due_on date not null check(due_on>=issued_on),
  base_amount numeric(16,2) not null check(base_amount>0),
  example_tax numeric(16,2) not null check(example_tax>=0),
  total_amount numeric(16,2) not null check(total_amount=base_amount+example_tax),
  settled_amount numeric(16,2) not null default 0 check(settled_amount>=0 and settled_amount<=total_amount),
  status text not null default 'BORRADOR INTERNO' check(status='BORRADOR INTERNO'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(counterparty_id,company_id) references public.counterparties(id,company_id),
  unique(id,company_id),unique(company_id,counterparty_id,reference),unique(company_id,request_id)
);
create index purchases_company_due_idx on public.purchases(company_id,due_on);
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  sale_id uuid, purchase_id uuid,
  amount numeric(16,2) not null check(amount>0 and amount<99999999999999.99),
  paid_on date not null,
  request_id uuid not null,
  external_reference text not null check(length(trim(external_reference)) between 2 and 80),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz, reversed_by uuid references auth.users(id),
  reversal_reason text, reversal_request uuid,
  check((sale_id is not null)::int+(purchase_id is not null)::int=1),
  check((reversed_at is null and reversed_by is null and reversal_reason is null and reversal_request is null)
    or (reversed_at is not null and reversed_by is not null and reversal_reason is not null and length(trim(reversal_reason)) between 5 and 300 and reversal_request is not null)),
  foreign key(sale_id,company_id) references public.sales(id,company_id),
  foreign key(purchase_id,company_id) references public.purchases(id,company_id),
  unique(company_id,request_id),unique(company_id,reversal_request)
);
create index settlements_company_date_idx on public.settlements(company_id,paid_on);
create index settlements_sale_idx on public.settlements(sale_id);
create index settlements_purchase_idx on public.settlements(purchase_id);
alter table public.purchases enable row level security;
alter table public.settlements enable row level security;
create policy purchase_read on public.purchases for select to authenticated using(public.can_read_company(company_id));
create policy settlement_read on public.settlements for select to authenticated using(public.can_read_company(company_id));
revoke all on public.purchases,public.settlements from public,anon,authenticated;
grant select on public.purchases,public.settlements to authenticated;
create trigger audit_purchase_created after insert on public.purchases for each row execute function public.record_audit_event();
create trigger audit_settlement_created after insert on public.settlements for each row execute function public.record_audit_event();
create trigger audit_settlement_reversed after update on public.settlements for each row execute function public.record_audit_event();

create function public.can_settle_company(p_company uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m join public.companies c on c.studio_id=m.studio_id
    where c.id=p_company and m.user_id=auth.uid() and m.active
    and (m.company_id is null or m.company_id=c.id) and m.role in ('admin','contador')
    and (auth.jwt()->>'aal')='aal2');
$$;
revoke all on function public.can_settle_company(uuid) from public,anon;
grant execute on function public.can_settle_company(uuid) to authenticated;

create function public.create_purchase_draft(p_company uuid,p_counterparty uuid,p_request uuid,
  p_reference text,p_date date,p_due date,p_base numeric,p_tax numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_existing public.purchases; v_id uuid; v_ref text:=upper(trim(p_reference));
begin
  if not public.can_write_company(p_company) then raise exception 'Acceso denegado'; end if;
  if p_request is null or p_date is null or p_due is null or p_due<p_date
     or p_date>(now() at time zone 'America/Lima')::date or v_ref is null or length(v_ref) not between 2 and 50
     or p_base is null or p_tax is null or p_base::text in ('NaN','Infinity','-Infinity')
     or p_tax::text in ('NaN','Infinity','-Infinity') or p_base<=0 or p_tax<0
     or p_base<>round(p_base,2) or p_tax<>round(p_tax,2) or p_base+p_tax>99999999999999.99 then
    raise exception 'Compra inválida'; end if;
  if not exists(select 1 from public.counterparties where id=p_counterparty and company_id=p_company) then
    raise exception 'Tercero no pertenece a la empresa'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text||p_request::text,0));
  select * into v_existing from public.purchases where company_id=p_company and request_id=p_request;
  if found then
    if v_existing.counterparty_id<>p_counterparty or v_existing.reference<>v_ref or v_existing.issued_on<>p_date
       or v_existing.due_on<>p_due or v_existing.base_amount<>p_base or v_existing.example_tax<>p_tax then
      raise exception 'Solicitud repetida con datos diferentes'; end if;
    return v_existing.id;
  end if;
  insert into public.purchases(company_id,counterparty_id,request_id,reference,issued_on,due_on,
    base_amount,example_tax,total_amount,created_by)
  values(p_company,p_counterparty,p_request,v_ref,p_date,p_due,p_base,p_tax,p_base+p_tax,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_purchase_draft(uuid,uuid,uuid,text,date,date,numeric,numeric) from public,anon;
grant execute on function public.create_purchase_draft(uuid,uuid,uuid,text,date,date,numeric,numeric) to authenticated;

create function public.apply_settlement(p_company uuid,p_kind text,p_document uuid,p_request uuid,
  p_amount numeric,p_date date,p_external_reference text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_existing public.settlements; v_total numeric; v_paid numeric; v_issued date; v_id uuid;
begin
  if not public.can_settle_company(p_company) then raise exception 'Acceso denegado'; end if;
  if p_request is null or p_document is null or p_kind is null or p_kind not in ('sale','purchase')
     or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0
     or p_amount<>round(p_amount,2) or p_amount>=99999999999999.99 or p_date is null
     or p_date>(now() at time zone 'America/Lima')::date
     or length(trim(coalesce(p_external_reference,''))) not between 2 and 80 then raise exception 'Movimiento inválido'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text||p_request::text,0));
  select * into v_existing from public.settlements where company_id=p_company and request_id=p_request;
  if found then
    if (p_kind='sale' and v_existing.sale_id is distinct from p_document)
       or (p_kind='purchase' and v_existing.purchase_id is distinct from p_document)
       or v_existing.amount<>p_amount or v_existing.paid_on<>p_date
       or v_existing.external_reference<>trim(p_external_reference) then raise exception 'Solicitud repetida con datos diferentes'; end if;
    return v_existing.id;
  end if;
  -- Lock the document BEFORE checking/updating its balance. All money RPCs use this lock order.
  if p_kind='sale' then
    select total_amount,settled_amount,issued_on into v_total,v_paid,v_issued
      from public.sales where id=p_document and company_id=p_company for update;
  else
    select total_amount,settled_amount,issued_on into v_total,v_paid,v_issued
      from public.purchases where id=p_document and company_id=p_company for update;
  end if;
  if not found then raise exception 'Documento no pertenece a la empresa'; end if;
  if p_date<v_issued or p_amount>v_total-v_paid then raise exception 'Fecha o saldo inválido'; end if;
  insert into public.settlements(company_id,sale_id,purchase_id,amount,paid_on,request_id,external_reference,created_by)
  values(p_company,case when p_kind='sale' then p_document end,case when p_kind='purchase' then p_document end,
    p_amount,p_date,p_request,trim(p_external_reference),auth.uid()) returning id into v_id;
  if p_kind='sale' then update public.sales set settled_amount=settled_amount+p_amount where id=p_document;
  else update public.purchases set settled_amount=settled_amount+p_amount where id=p_document; end if;
  return v_id;
end;
$$;
revoke all on function public.apply_settlement(uuid,text,uuid,uuid,numeric,date,text) from public,anon;
grant execute on function public.apply_settlement(uuid,text,uuid,uuid,numeric,date,text) to authenticated;

create function public.reverse_settlement(p_company uuid,p_settlement uuid,p_request uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_row public.settlements; v_doc uuid; v_other uuid;
begin
  if not public.can_settle_company(p_company) then raise exception 'Acceso denegado'; end if;
  if p_request is null or length(trim(coalesce(p_reason,''))) not between 5 and 300 then raise exception 'Motivo de reverso inválido'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text||p_request::text,0));
  select * into v_row from public.settlements where id=p_settlement and company_id=p_company;
  if not found then raise exception 'Movimiento no pertenece a la empresa'; end if;
  -- Same document-then-settlement lock order as apply_settlement, avoiding crossed lock order.
  if v_row.sale_id is not null then
    perform 1 from public.sales where id=v_row.sale_id and company_id=p_company for update;
  else perform 1 from public.purchases where id=v_row.purchase_id and company_id=p_company for update; end if;
  select * into v_row from public.settlements where id=p_settlement and company_id=p_company for update;
  if v_row.reversed_at is not null then
    if v_row.reversal_request=p_request and v_row.reversal_reason=trim(p_reason) then return v_row.id; end if;
    raise exception 'Movimiento ya revertido'; end if;
  select id into v_other from public.settlements where company_id=p_company and reversal_request=p_request;
  if found then raise exception 'Solicitud de reverso ya utilizada'; end if;
  if v_row.sale_id is not null then update public.sales set settled_amount=settled_amount-v_row.amount where id=v_row.sale_id;
  else update public.purchases set settled_amount=settled_amount-v_row.amount where id=v_row.purchase_id; end if;
  update public.settlements set reversed_at=now(),reversed_by=auth.uid(),reversal_reason=trim(p_reason),reversal_request=p_request where id=v_row.id;
  return v_row.id;
end;
$$;
revoke all on function public.reverse_settlement(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.reverse_settlement(uuid,uuid,uuid,text) to authenticated;
commit;
