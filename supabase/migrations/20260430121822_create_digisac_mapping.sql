-- Create Digisac mapping table
CREATE TABLE IF NOT EXISTS public.digisac_analyst_mapping (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    digisac_user_id TEXT NOT NULL UNIQUE,
    digisac_user_name TEXT NOT NULL,
    analyst_id UUID NOT NULL REFERENCES public.analysts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add RLS
ALTER TABLE public.digisac_analyst_mapping ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to select
CREATE POLICY "Allow authenticated read access" 
ON public.digisac_analyst_mapping 
FOR SELECT 
TO authenticated 
USING (true);

-- Allow authenticated users to insert/update/delete (or restrict to admin if needed)
CREATE POLICY "Allow authenticated all access" 
ON public.digisac_analyst_mapping 
FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_digisac_analyst_mapping_updated_at
    BEFORE UPDATE ON public.digisac_analyst_mapping
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
