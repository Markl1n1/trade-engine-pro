CREATE TABLE public.optimization_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  suggestion_type text NOT NULL,
  current_value jsonb,
  suggested_value jsonb,
  reason text,
  based_on_signals integer,
  applied boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.optimization_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own suggestions"
  ON public.optimization_suggestions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert suggestions"
  ON public.optimization_suggestions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update suggestions"
  ON public.optimization_suggestions FOR UPDATE
  USING (true);

CREATE POLICY "Users can update their own suggestions"
  ON public.optimization_suggestions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);