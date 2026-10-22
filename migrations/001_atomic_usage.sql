-- Apply to the existing profiles schema using a trusted migration/admin connection.
-- profiles.id must be UUID and questions_used/question_limit nonnegative integers.
BEGIN;
CREATE TABLE IF NOT EXISTS public.question_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.question_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_reservations FROM anon, authenticated;
GRANT ALL ON public.question_reservations TO service_role;
-- Clients must never edit their own quotas, plan or billing state.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_question(user_id uuid)
RETURNS TABLE(reservation_id uuid, questions_used integer, question_limit integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE used integer; lim integer; rid uuid;
BEGIN
  UPDATE public.profiles p SET questions_used = p.questions_used + 1
  WHERE p.id = user_id AND p.questions_used >= 0 AND p.questions_used < p.question_limit
  RETURNING p.questions_used, p.question_limit INTO used, lim;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.question_reservations(user_id) VALUES(user_id) RETURNING id INTO rid;
  RETURN QUERY SELECT rid, used, lim;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_question(reservation_id uuid, refund boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid;
BEGIN
  DELETE FROM public.question_reservations WHERE id = reservation_id RETURNING user_id INTO uid;
  IF FOUND AND refund THEN
    UPDATE public.profiles SET questions_used = greatest(questions_used - 1, 0) WHERE id = uid;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_question(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_question(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_question(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_question(uuid, boolean) TO service_role;
COMMIT;
