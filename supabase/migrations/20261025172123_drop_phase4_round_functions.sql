-- The live site now uses bj_deal / bj_act (which add deadlines and seat
-- bookkeeping). Remove the Phase 4 versions they replaced.
drop function public.blackjack_start_round(uuid, text, jsonb, jsonb, jsonb, jsonb);
drop function public.blackjack_apply_action(uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb);
