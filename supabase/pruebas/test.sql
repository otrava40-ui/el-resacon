\set ON_ERROR_STOP 1
-- helpers (como postgres)
create or replace function pg_temp.como(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',u)::text, false) $$;

-- 1) Altas: el primero es admin sin código
do $$ begin assert comprobar_invitacion('PRIMERO'), 'sin cuentas debe valer cualquier código'; end $$;
insert into auth.users(id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000001','sergio@x.es','{"apodo":"Sergio"}');
do $$ begin assert (select rol from profiles where apodo='Sergio')='admin', 'primero no admin'; end $$;
-- sin código falla
do $$ begin
  begin insert into auth.users(email,raw_user_meta_data) values ('malo@x.es','{"apodo":"Malo"}'); raise exception 'NO DEBERIA';
  exception when others then if sqlerrm like 'NO DEBERIA%' then raise; end if; raise notice 'OK sin código rechazado: %', sqlerrm; end;
end $$;
-- Sergio crea invitación de 20 usos
select pg_temp.como('00000000-0000-0000-0000-000000000001');
set role authenticated;
select crear_invitacion(20, 14, 'grupo') as codigo \gset
reset role;
select :'codigo' as cod, comprobar_invitacion(:'codigo') as valida, comprobar_invitacion('ZZZZZZ') as invalida;
-- 10 miembros más (11 en total con Sergio). Sergio también participa.
insert into auth.users(id,email,raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000000'||lpad(i::text,2,'0'))::uuid, 'm'||i||'@x.es',
       json_build_object('apodo','Miembro'||i,'invitacion',lower(:'codigo'))::jsonb
from generate_series(2,10) i;
do $$ begin assert (select count(*) from profiles)=10, 'deben ser 10'; assert (select usos from invites)=9; end $$;

-- 2) Evento con 5 compras, reparto igual entre 10
select pg_temp.como('00000000-0000-0000-0000-000000000001');
set role authenticated;
insert into events(nombre, fecha_inicio, fecha_limite_pago) values ('Fiestas San Lorenzo 2027','2027-08-09','2027-08-01');
insert into purchase_items(event_id,concepto,cantidad,precio_unitario_cents) values
 (1,'Cerveza',10,1599),(1,'Hielo',4,250),(1,'Vermut',3,899),(1,'Patatas',6,175),(1,'Vasos',2,333);
insert into event_participants(event_id,user_id) select 1,id from profiles;
select guardar_reparto(1);
reset role;
select sum(total_cents) total, (select importe_cents from charges limit 1) parte, count(*) from purchase_items, (select 1) x where event_id=1 group by x;
select count(*) cargos, min(importe_cents), max(importe_cents) from charges where event_id=1;
do $$ begin assert (select count(*) from charges where event_id=1)=10; assert (select bool_and(importe_cents=floor((select sum(total_cents) from purchase_items where event_id=1)/10.0)) from charges where event_id=1), 'parte mal'; end $$;

-- 3) Miembro 2 marca pagado; no puede ponerse pagado
select pg_temp.como('00000000-0000-0000-0000-000000000002');
set role authenticated;
select count(*) as cargos_que_ve_m2 from charges;
do $$ begin assert (select count(*) from charges)=1, 'm2 ve cargos ajenos'; end $$;
select marcar_pagado((select id from charges limit 1), 'bizum', null);
update charges set estado='pagado';  -- no debe afectar a nada
do $$ begin assert (select estado from charges)='pendiente', 'm2 se puso pagado'; end $$;
do $$ begin
  begin perform confirmar_pago(array[(select id from charges)]); raise exception 'NO DEBERIA';
  exception when others then if sqlerrm like 'NO DEBERIA%' then raise; end if; raise notice 'OK confirmar rechazado: %', sqlerrm; end;
end $$;
do $$ begin
  begin perform marcar_pagado((select id from charges), 'bizum', null); raise exception 'NO DEBERIA';
  exception when others then if sqlerrm like 'NO DEBERIA%' then raise; end if; raise notice 'OK doble marcar: %', sqlerrm; end;
end $$;
-- no puede leer saldo
do $$ begin assert not exists (select 1 from config where clave='saldo_bote_cents'), 'm2 ve saldo'; assert exists(select 1 from config where clave='iban'); end $$;
-- no puede hacerse admin
update profiles set rol='admin', apodo='Juan' where id=auth.uid();
do $$ begin assert (select rol from profiles where id=auth.uid())='member'; assert (select apodo from profiles where id=auth.uid())='Juan'; end $$;
-- no puede leer perfil privado de otros
do $$ begin assert (select count(*) from perfil_privado)=1; end $$;
-- no puede insertar cargos ni eventos
do $$ begin
  begin insert into events(nombre) values ('hack'); raise exception 'NO DEBERIA';
  exception when insufficient_privilege then raise notice 'OK evento bloqueado'; end;
end $$;
reset role;

-- 4) Admin confirma / rechaza
select pg_temp.como('00000000-0000-0000-0000-000000000001');
set role authenticated;
select count(*) por_confirmar from charges where estado='pendiente';
select confirmar_pago(array(select id from charges where estado='pendiente'));
-- m3 marca y admin rechaza
reset role; select pg_temp.como('00000000-0000-0000-0000-000000000003'); set role authenticated;
select marcar_pagado((select id from charges limit 1), 'revolut', '00000000-0000-0000-0000-000000000003/cap.jpg');
reset role; select pg_temp.como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select rechazar_pago((select id from charges where user_id='00000000-0000-0000-0000-000000000003'), 'No veo el Bizum');
-- efectivo a mano para m4
select confirmar_pago(array(select id from charges where user_id='00000000-0000-0000-0000-000000000004'), 'efectivo');
reset role;
select p.apodo, c.estado, c.metodo, c.motivo_rechazo from charges c join profiles p on p.id=c.user_id where c.user_id in ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004') order by 1;
select c.user_id, pe.de_estado, pe.a_estado, pe.motivo from payment_events pe join charges c on c.id=pe.charge_id where c.user_id='00000000-0000-0000-0000-000000000003' order by pe.id;

-- 5) Recalcular reparto tras añadir compra: los pagados no cambian
select pg_temp.como('00000000-0000-0000-0000-000000000001'); set role authenticated;
insert into purchase_items(event_id,concepto,cantidad,precio_unitario_cents) values (1,'Limones',1,347);
delete from event_participants where event_id=1 and user_id='00000000-0000-0000-0000-000000000010';
select guardar_reparto(1);
reset role;
select estado, importe_cents, count(*) from charges where event_id=1 group by 1,2 order by 1;

-- 6) Tareas y tickets
select pg_temp.como('00000000-0000-0000-0000-000000000001'); set role authenticated;
insert into event_tasks(event_id,titulo,presupuesto_cents,fecha) values (1,'Coger y poner bebidas',5000,'2027-08-08');
insert into task_assignees values (1,'00000000-0000-0000-0000-000000000005');
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000005'); set role authenticated;
insert into tickets(user_id,task_id,concepto,importe_cents,foto_url,estado) values (auth.uid(),1,'Bebidas Mercadona',4230,'00000000-0000-0000-0000-000000000005/t1.jpg','reembolsado');
select id, event_id, estado from tickets;  -- estado debe ser enviado (trigger) y evento 1
do $$ begin assert (select estado from tickets limit 1)='enviado'; assert (select event_id from tickets limit 1)=1; end $$;
select marcar_tarea(1,true);
-- storage: sube a su carpeta sí, a otra no
insert into storage.objects(bucket_id,name) values ('tickets','00000000-0000-0000-0000-000000000005/t1.jpg');
do $$ begin
  begin insert into storage.objects(bucket_id,name) values ('tickets','00000000-0000-0000-0000-000000000006/x.jpg'); raise exception 'NO DEBERIA';
  exception when insufficient_privilege then raise notice 'OK storage carpeta ajena bloqueada'; end;
end $$;
reset role;
-- m6 no encargado: ticket con tarea falla; ticket suelto ok
select pg_temp.como('00000000-0000-0000-0000-000000000006'); set role authenticated;
do $$ begin
  begin insert into tickets(user_id,task_id,concepto,importe_cents) values (auth.uid(),1,'X',100); raise exception 'NO DEBERIA';
  exception when insufficient_privilege then raise notice 'OK ticket de tarea ajena bloqueado'; end;
end $$;
insert into tickets(user_id,event_id,concepto,importe_cents) values (auth.uid(),1,'Servilletas',590);
do $$ begin assert (select count(*) from storage.objects)=0, 'm6 ve ticket ajeno antes de aprobar'; end $$;
update tickets set importe_cents=600 where user_id=auth.uid();
reset role;
-- admin aprueba ticket de m5 (se añade a compra) y reembolsa; m6 se compensa contra su cargo
select pg_temp.como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select aprobar_ticket(1, true);
select reembolsar_ticket(1);
select tipo, concepto, importe_cents from pot_movements;
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000006'); set role authenticated;
do $$ begin assert (select count(*) from storage.objects)=1, 'm6 no ve ticket del bote'; end $$;
do $$ begin
  begin update tickets set importe_cents=700, estado='aprobado'; if (select importe_cents from tickets where user_id=auth.uid())<>700 then raise exception 'no editó'; end if; if (select estado from tickets where user_id=auth.uid())<>'enviado' then raise exception 'cambió estado'; end if; end;
end $$;
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ begin
  begin perform compensar_ticket((select id from tickets where user_id='00000000-0000-0000-0000-000000000006'), (select id from charges where user_id='00000000-0000-0000-0000-000000000006' and estado='sin_pagar')); raise exception 'NO DEBERIA';
  exception when others then if sqlerrm like 'NO DEBERIA%' then raise; end if; raise notice 'OK compensación menor rechazada: %', sqlerrm; end;
end $$;
select crear_cargos_sueltos(array['00000000-0000-0000-0000-000000000006'::uuid], 'Multa por llegar tarde', 300, null);
select compensar_ticket((select id from tickets where user_id='00000000-0000-0000-0000-000000000006'), (select id from charges where concepto like 'Multa%')) as queda_por_devolver;
reset role;
select id, estado, compensado_charge_id from tickets order by id;
select concepto, estado, metodo from charges where concepto like 'Multa%';
select tipo, titulo, count(*) from avisos group by 1,2 order by 1;
select count(*) total_avisos from avisos;
-- 7) Apuntarse
select pg_temp.como('00000000-0000-0000-0000-000000000001'); set role authenticated;
insert into events(nombre, autoapuntarse) values ('Cena Navidad', true);
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000007'); set role authenticated;
select apuntarme((select id from events where nombre='Cena Navidad'), true);
do $$ begin
  begin perform apuntarme(1, true); raise exception 'NO DEBERIA';
  exception when others then if sqlerrm like 'NO DEBERIA%' then raise; end if; raise notice 'OK no autoapuntarse: %', sqlerrm; end;
end $$;
-- gastos visibles, ingresos no
select count(*) gastos_visibles from pot_movements;
reset role;
-- anon no ve nada
set role anon;
do $$ begin
  begin perform 1 from profiles; raise exception 'NO DEBERIA';
  exception when insufficient_privilege then raise notice 'OK anon bloqueado'; end;
end $$;
select comprobar_invitacion('XXXX') as anon_puede_comprobar;
reset role;

-- 8) Invitados
select pg_temp.como('00000000-0000-0000-0000-000000000001'); set role authenticated;
insert into events(nombre, modo_reparto) values ('Cena invitados','igual');
insert into purchase_items(event_id,concepto,total_cents) select id,'Cena',10000 from events where nombre='Cena invitados';
insert into purchase_items(event_id,concepto,comprado_por) select id,'Coger y poner bebidas','00000000-0000-0000-0000-000000000002' from events where nombre='Cena invitados';
insert into event_participants select (select id from events where nombre='Cena invitados'), id from profiles where id in ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
reset role;
-- m2 trae a su novia (miembro)
select pg_temp.como('00000000-0000-0000-0000-000000000002'); set role authenticated;
select traer_invitado((select id from events where nombre='Cena invitados'), 'Laura', 'novia') as guest_laura \gset
do $$ begin
  begin perform traer_invitado((select id from events where nombre='Cena invitados'), 'X', null, '00000000-0000-0000-0000-000000000003'); raise exception 'NO DEBERIA';
  exception when others then if sqlerrm like 'NO DEBERIA%' then raise; end if; raise notice 'OK no puede apuntar invitados de otro: %', sqlerrm; end;
end $$;
do $$ begin
  begin update event_guests set paga=false; if exists(select 1 from event_guests where paga=false) then raise exception 'cambió paga'; end if; end;
end $$;
reset role;
-- admin añade invitado de m3 que NO paga, y reparte: 10000 / (3 + Laura) = 2500
select pg_temp.como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select traer_invitado((select id from events where nombre='Cena invitados'), 'Pepe', 'primo', '00000000-0000-0000-0000-000000000003') as guest_pepe \gset
update event_guests set paga=false where id=:guest_pepe;
select guardar_reparto((select id from events where nombre='Cena invitados'));
reset role;
select p.apodo, c.concepto, c.importe_cents, c.guest_id is not null as invitado from charges c join profiles p on p.id=c.user_id
 where c.event_id=(select id from events where nombre='Cena invitados') and c.estado<>'anulado' order by 1,3;
do $$ begin
  assert (select count(*) from charges where event_id=(select id from events where nombre='Cena invitados') and estado<>'anulado')=4, 'deben ser 4 cargos';
  assert (select count(*) from charges where user_id='00000000-0000-0000-0000-000000000002' and event_id=(select id from events where nombre='Cena invitados') and estado<>'anulado')=2, 'm2 debe tener 2 cargos';
  assert (select bool_and(importe_cents=2500) from charges where event_id=(select id from events where nombre='Cena invitados') and estado<>'anulado'), 'parte mal';
end $$;
-- m2 ve sus dos cargos; paga el de Laura y ya no la puede quitar
select pg_temp.como('00000000-0000-0000-0000-000000000002'); set role authenticated;
select count(*) as cargos_m2_cena from charges where event_id=(select id from events where nombre='Cena invitados');
select marcar_pagado((select id from charges where guest_id=:guest_laura), 'bizum', null);
do $$ begin
  begin perform quitar_invitado((select id from event_guests where nombre='Laura')); raise exception 'NO DEBERIA';
  exception when others then if sqlerrm like 'NO DEBERIA%' then raise; end if; raise notice 'OK invitado pagado no se quita: %', sqlerrm; end;
end $$;
reset role;
-- admin hace que Pepe pague y quita... recalcula: 10000/5 = 2000; cargo de Laura (pendiente) no se toca
select pg_temp.como('00000000-0000-0000-0000-000000000001'); set role authenticated;
update event_guests set paga=true where id=:guest_pepe;
select guardar_reparto((select id from events where nombre='Cena invitados'));
-- y ahora Pepe deja de pagar: su cargo sin pagar se anula
update event_guests set paga=false where id=:guest_pepe;
select guardar_reparto((select id from events where nombre='Cena invitados'));
select quitar_invitado(:guest_pepe);
reset role;
select p.apodo, c.concepto, c.importe_cents, c.estado from charges c join profiles p on p.id=c.user_id
 where c.event_id=(select id from events where nombre='Cena invitados') order by c.id;
select tipo, cuerpo from avisos where tipo='invitado_nuevo';

select 'TODAS LAS PRUEBAS OK' as resultado;
