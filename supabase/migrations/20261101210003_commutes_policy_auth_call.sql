-- Evaluate the sign-in token once per query instead of once per row.
alter policy "People can read their own commute" on public.commutes
  using ((select auth.jwt()) ->> 'sub' = user_id);

alter policy "People can add their own commute" on public.commutes
  with check ((select auth.jwt()) ->> 'sub' = user_id);

alter policy "People can change their own commute" on public.commutes
  using ((select auth.jwt()) ->> 'sub' = user_id)
  with check ((select auth.jwt()) ->> 'sub' = user_id);

alter policy "People can delete their own commute" on public.commutes
  using ((select auth.jwt()) ->> 'sub' = user_id);
