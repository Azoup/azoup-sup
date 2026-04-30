-- Create Digisac mapping table
CREATE TABLE IF NOT EXISTS public.digisac_analyst_mapping (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    digisac_user_id TEXT NOT NULL UNIQUE,
    digisac_user_name TEXT NOT NULL,
    analyst_id UUID NOT NULL REFERENCES public.analysts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.digisac_analyst_mapping ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Authenticated users can view digisac mappings"
ON public.digisac_analyst_mapping
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert digisac mappings"
ON public.digisac_analyst_mapping
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update digisac mappings"
ON public.digisac_analyst_mapping
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete digisac mappings"
ON public.digisac_analyst_mapping
FOR DELETE
TO authenticated
USING (true);

-- Trigger for updated_at (using existing update_updated_at_column function)
CREATE TRIGGER update_digisac_analyst_mapping_updated_at
BEFORE UPDATE ON public.digisac_analyst_mapping
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_digisac_mapping_analyst_id ON public.digisac_analyst_mapping(analyst_id);