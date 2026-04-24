create or replace function public.normalize_person_name(input text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(regexp_replace(translate(coalesce(input, ''), 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '[^a-zA-Z0-9. ]+', '', 'g')))
$$;

create or replace function public.resolve_profile_id_by_name(name_input text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select split_part(public.normalize_person_name(name_input), ' ', 1) as first_name
  ), candidates as (
    select
      p.id,
      split_part(replace(public.normalize_person_name(coalesce(p.display_name, '')), '.', ' '), ' ', 1) as profile_first_name
    from public.profiles p
  ), scored as (
    select
      c.id,
      case
        when c.profile_first_name = t.first_name then 100
        when c.profile_first_name like t.first_name || '%' then 80 - greatest(length(c.profile_first_name) - length(t.first_name), 0)
        when t.first_name like c.profile_first_name || '%' and length(c.profile_first_name) >= 3 then 60 - greatest(length(t.first_name) - length(c.profile_first_name), 0)
        else 0
      end as score
    from candidates c
    cross join target t
    where t.first_name <> '' and c.profile_first_name <> ''
  )
  select id
  from scored
  where score > 0
  order by score desc, id
  limit 1
$$;

grant execute on function public.resolve_profile_id_by_name(text) to authenticated;
grant execute on function public.normalize_person_name(text) to authenticated;