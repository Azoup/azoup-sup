-- Add DELETE policies for analysts and developers, restricted to admins

CREATE POLICY "Allow admin to delete analysts" 
ON public.analysts 
FOR DELETE 
TO authenticated 
USING (public.has_role('admin', auth.uid()));

CREATE POLICY "Allow admin to delete developers" 
ON public.developers 
FOR DELETE 
TO authenticated 
USING (public.has_role('admin', auth.uid()));
