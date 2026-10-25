-- The live site now uses blackjack_start_round / blackjack_apply_action
-- (which also record stats and decisions). Remove the Phase 3 versions.
drop function public.bj_start_round(uuid, text, jsonb, jsonb, jsonb);
drop function public.bj_update_round(uuid, integer, text, jsonb, jsonb, jsonb);
