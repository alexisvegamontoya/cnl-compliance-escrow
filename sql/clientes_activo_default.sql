-- Cliente activo/inactivo: default true y backfill de nulos, para que el cálculo
-- de cumplimiento (que excluye inactivos) trate como activo a todo lo existente.
alter table public.clientes alter column activo set default true;
update public.clientes set activo = true where activo is null;

notify pgrst, 'reload schema';
