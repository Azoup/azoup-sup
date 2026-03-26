
-- Create business_units table
CREATE TABLE public.business_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view business_units" ON public.business_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert business_units" ON public.business_units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update business_units" ON public.business_units FOR UPDATE TO authenticated USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_business_units_updated_at BEFORE UPDATE ON public.business_units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add new columns to doubt_records
ALTER TABLE public.doubt_records ADD COLUMN contacts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.doubt_records ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE public.doubt_records ADD COLUMN business_unit_id UUID REFERENCES public.business_units(id);
ALTER TABLE public.doubt_records ADD COLUMN description TEXT;
