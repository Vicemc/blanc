-- =============================================================================
-- Granular Player Writes — evita last-write-wins
-- =============================================================================
-- Executar no SQL Editor do Supabase após o schema base.
-- A RPC abaixo permite que players atualizem ATOMICAMENTE apenas o próprio
-- tamer dentro do JSONB do app_state, sem reescrever o estado inteiro.

create or replace function public.update_my_tamer(p_tamer jsonb)
returns jsonb as $$
declare
  v_my_id    text;
  v_tamer_id text;
  v_campaign text := 'midnight-summer';
begin
  v_my_id := public.my_character_id();
  if v_my_id is null then
    return jsonb_build_object('ok', false, 'reason', 'Sem personagem vinculado.');
  end if;

  v_tamer_id := p_tamer ->> 'id';
  if v_tamer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'Tamer sem id.');
  end if;
  if not (public.is_gm() or v_tamer_id = v_my_id) then
    return jsonb_build_object('ok', false, 'reason', 'Você só pode editar o próprio tamer.');
  end if;

  update public.app_state
  set state = jsonb_set(
    state,
    '{tamers}',
    (
      select jsonb_agg(case when t ->> 'id' = v_tamer_id then p_tamer else t end)
      from jsonb_array_elements(state -> 'tamers') t
    )
  ),
  updated_at = now()
  where campaign = v_campaign;

  return jsonb_build_object('ok', true);
end;
$$ language plpgsql security definer;

grant execute on function public.update_my_tamer(jsonb) to authenticated;

-- =============================================================================
-- Atualiza atomicamente tamer + linha de digimon do player num único UPDATE.
-- p_line pode ser null (atualiza só o tamer).
-- =============================================================================
create or replace function public.update_my_tamer_and_line(p_tamer jsonb, p_line jsonb default null)
returns jsonb as $$
declare
  v_my_id    text;
  v_tamer_id text;
  v_campaign text := 'midnight-summer';
begin
  v_my_id := public.my_character_id();
  if v_my_id is null then
    return jsonb_build_object('ok', false, 'reason', 'Sem personagem vinculado.');
  end if;

  v_tamer_id := p_tamer ->> 'id';
  if v_tamer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'Tamer sem id.');
  end if;
  if not (public.is_gm() or v_tamer_id = v_my_id) then
    return jsonb_build_object('ok', false, 'reason', 'Você só pode editar o próprio tamer.');
  end if;

  update public.app_state
  set state = (
    case when p_line is null then
      jsonb_set(
        state,
        '{tamers}',
        (select jsonb_agg(case when t ->> 'id' = v_tamer_id then p_tamer else t end)
         from jsonb_array_elements(state -> 'tamers') t)
      )
    else
      jsonb_set(
        jsonb_set(
          state,
          '{tamers}',
          (select jsonb_agg(case when t ->> 'id' = v_tamer_id then p_tamer else t end)
           from jsonb_array_elements(state -> 'tamers') t)
        ),
        '{bestiary}',
        (select jsonb_agg(case when b ->> 'id' = (p_line ->> 'id') then p_line else b end)
         from jsonb_array_elements(state -> 'bestiary') b)
      )
    end
  ),
  updated_at = now()
  where campaign = v_campaign;

  return jsonb_build_object('ok', true);
end;
$$ language plpgsql security definer;

grant execute on function public.update_my_tamer_and_line(jsonb, jsonb) to authenticated;
