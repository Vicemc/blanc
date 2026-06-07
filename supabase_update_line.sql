-- =============================================================================
-- Atualiza atomicamente uma linha de digimon no bestiary do app_state.
-- Usado para persistir imageKey de digimons sem tamer vinculado (wilds, guests)
-- sem sobrescrever o estado inteiro (e apagar stages do Palco).
-- Só o GM pode chamar esta função.
-- =============================================================================
create or replace function public.update_digimon_line(p_line jsonb)
returns jsonb as $$
declare
  v_line_id text;
  v_campaign text := 'midnight-summer';
begin
  if not public.is_gm() then
    return jsonb_build_object('ok', false, 'reason', 'Apenas o GM pode atualizar linhas de digimon.');
  end if;

  v_line_id := p_line ->> 'id';
  if v_line_id is null then
    return jsonb_build_object('ok', false, 'reason', 'Line sem id.');
  end if;

  update public.app_state
  set state = jsonb_set(
    state,
    '{bestiary}',
    (
      select jsonb_agg(case when b ->> 'id' = v_line_id then p_line else b end)
      from jsonb_array_elements(state -> 'bestiary') b
    )
  ),
  updated_at = now()
  where campaign = v_campaign;

  return jsonb_build_object('ok', true);
end;
$$ language plpgsql security definer;

grant execute on function public.update_digimon_line(jsonb) to authenticated;
