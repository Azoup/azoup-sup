import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { digisacApi } from "@/integrations/digisac/api";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link2, Trash2 } from "lucide-react";

export function DigisacMappingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch internal analysts
  const { data: analysts } = useQuery({
    queryKey: ['analysts-internal'],
    queryFn: async () => {
      const { data, error } = await supabase.from('analysts').select('id, name').eq('status', 'active');
      if (error) throw error;
      return data;
    }
  });

  // Fetch Digisac users
  const { data: digisacUsers, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['digisac-users'],
    queryFn: digisacApi.getDigisacUsers,
    enabled: isOpen
  });

  // Fetch current mappings
  const { data: mappings, isLoading: isLoadingMappings } = useQuery({
    queryKey: ['digisac-mappings'],
    queryFn: digisacApi.getMappings,
    enabled: isOpen
  });

  const usersError = queryClient.getQueryState(['digisac-users'])?.error as Error | null | undefined;
  const mappingsError = queryClient.getQueryState(['digisac-mappings'])?.error as Error | null | undefined;

  // Save mapping mutation
  const saveMappingMutation = useMutation({
    mutationFn: (vars: { digisacUserId: string, digisacUserName: string, analystId: string }) => 
      digisacApi.saveMapping(vars.digisacUserId, vars.digisacUserName, vars.analystId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digisac-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['digisac-dashboard'] });
      toast.success("Mapeamento salvo com sucesso!");
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar mapeamento: ${err.message}`);
    }
  });

  // Delete mapping mutation
  const deleteMappingMutation = useMutation({
    mutationFn: digisacApi.deleteMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digisac-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['digisac-dashboard'] });
      toast.success("Mapeamento removido!");
    },
    onError: (err: any) => {
      toast.error(`Erro ao remover mapeamento: ${err.message}`);
    }
  });

  const getMappingForDigisacUser = (digisacUserId: string) => {
    return mappings?.find(m => m.digisac_user_id === digisacUserId);
  };

  const handleSelectAnalyst = (digisacUser: any, analystId: string) => {
    saveMappingMutation.mutate({
      digisacUserId: digisacUser.id,
      digisacUserName: digisacUser.name,
      analystId
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Link2 className="w-4 h-4" />
          Mapear Analistas Digisac
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mapeamento de Analistas - Digisac</DialogTitle>
          <DialogDescription>
            Vincule os usuários retornados pela API do Digisac com os analistas cadastrados no sistema interno para que as métricas sejam agrupadas corretamente.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {(isLoadingUsers || isLoadingMappings) ? (
            <div className="text-center py-8 text-muted-foreground">Carregando dados...</div>
          ) : (usersError || mappingsError) ? (
            <div className="text-center py-8 text-destructive space-y-2">
              <p className="font-medium">Não foi possível carregar o mapeamento do Digisac.</p>
              <p className="text-sm">{usersError?.message || mappingsError?.message}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário Digisac</TableHead>
                  <TableHead>Analista Interno Correspondente</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {digisacUsers?.map((user) => {
                  const mapping = getMappingForDigisacUser(user.id);
                  
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.name} <br/>
                        <span className="text-xs text-muted-foreground">{user.id}</span>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={mapping?.analyst_id || "unmapped"} 
                          onValueChange={(val) => handleSelectAnalyst(user, val)}
                        >
                          <SelectTrigger className={mapping ? "border-green-200 bg-green-50/10" : "border-yellow-200 bg-yellow-50/10"}>
                            <SelectValue placeholder="Selecione um analista" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unmapped" disabled>
                              -- Não vinculado --
                            </SelectItem>
                            {analysts?.map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {mapping && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-destructive"
                            onClick={() => deleteMappingMutation.mutate(mapping.id)}
                            title="Remover vínculo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {digisacUsers?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                      Nenhum usuário encontrado na API do Digisac.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
