
-- Create timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Analysts table
CREATE TABLE public.analysts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.analysts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view analysts" ON public.analysts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert analysts" ON public.analysts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update analysts" ON public.analysts FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_analysts_updated_at BEFORE UPDATE ON public.analysts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Doubt records table
CREATE TABLE public.doubt_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  analyst_id UUID NOT NULL REFERENCES public.analysts(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.doubt_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view doubt_records" ON public.doubt_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert doubt_records" ON public.doubt_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update doubt_records" ON public.doubt_records FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete doubt_records" ON public.doubt_records FOR DELETE TO authenticated USING (true);

-- Storage bucket for analyst photos
INSERT INTO storage.buckets (id, name, public) VALUES ('analyst-photos', 'analyst-photos', true);

CREATE POLICY "Anyone can view analyst photos" ON storage.objects FOR SELECT USING (bucket_id = 'analyst-photos');
CREATE POLICY "Authenticated users can upload analyst photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'analyst-photos');
CREATE POLICY "Authenticated users can update analyst photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'analyst-photos');
CREATE POLICY "Authenticated users can delete analyst photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'analyst-photos');

-- Index for performance
CREATE INDEX idx_doubt_records_date ON public.doubt_records(record_date);
CREATE INDEX idx_doubt_records_analyst ON public.doubt_records(analyst_id);
