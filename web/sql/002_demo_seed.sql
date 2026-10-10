-- Optional, fictitious pilot seed. Run AFTER 001_pilot.sql on an exclusive disposable project.
-- Replace both placeholder emails. Invite and confirm both users before executing.
-- Do not run in BAP Legal or Control de Gastos projects.
do $$
declare
  v_admin uuid;
  v_reader uuid;
  v_studio uuid;
  v_first uuid;
begin
  select id into v_admin from auth.users where email='CORREO_ADMIN_INVITADO';
  select id into v_reader from auth.users where email='CORREO_LECTOR_INVITADO';
  if v_admin is null or v_reader is null or v_admin=v_reader then
    raise exception 'Invita dos usuarios de prueba distintos y cambia ambos correos en el archivo';
  end if;
  insert into public.studios(name) values('Estudio BAP Piloto') returning id into v_studio;
  insert into public.companies(studio_id,name,reference_code,sector) values
    (v_studio,'Andes Consultores Demo','DEMO-001','servicios'),
    (v_studio,'Mercado Central Demo','DEMO-002','comercio'),
    (v_studio,'Obras del Pacifico Demo','DEMO-003','construccion'),
    (v_studio,'Servicios Lima Demo','DEMO-004','servicios'),
    (v_studio,'Comercial Horizonte Demo','DEMO-005','comercio');
  select id into v_first from public.companies where studio_id=v_studio and reference_code='DEMO-001';
  insert into public.memberships(user_id,studio_id,company_id,role) values
    (v_admin,v_studio,null,'admin'),(v_reader,v_studio,v_first,'lector');
  insert into public.counterparties(company_id,reference_code,name)
  select c.id,'CLIENTE-DEMO','Cliente ficticio de '||c.reference_code
  from public.companies c where c.studio_id=v_studio;
end;
$$;
