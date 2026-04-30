CREATE POLICY "Authenticated users can delete analysts"
ON public.analysts FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete business_units"
ON public.business_units FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete developers"
ON public.developers FOR DELETE TO authenticated USING (true);