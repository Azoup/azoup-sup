
-- Create table for multiple images per card
CREATE TABLE public.kanban_card_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kanban_card_images ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view card images" ON public.kanban_card_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert card images" ON public.kanban_card_images FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete card images" ON public.kanban_card_images FOR DELETE TO authenticated USING (true);

-- Migrate existing image_url data from kanban_cards
INSERT INTO public.kanban_card_images (card_id, image_url)
SELECT id, image_url FROM public.kanban_cards WHERE image_url IS NOT NULL;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_card_images;
