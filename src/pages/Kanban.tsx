import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logActivity } from '@/hooks/useActivityLog';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Tag, Loader2, ImagePlus, X } from 'lucide-react';

const COLUMNS = [
  { id: 'pending', title: 'Pendências' },
  { id: 'scheduled', title: 'Agendamentos' },
  { id: 'no_response', title: 'Sem Resposta' },
  { id: 'done', title: 'Concluídos' },
];

const COLUMN_COLORS: Record<string, string> = {
  pending: 'border-t-amber-500',
  scheduled: 'border-t-blue-500',
  no_response: 'border-t-rose-500',
  done: 'border-t-emerald-500',
};

const Kanban = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [targetColumn, setTargetColumn] = useState('pending');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [analystId, setAnalystId] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [editingCard, setEditingCard] = useState<any>(null);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');

  const { data: analysts = [] } = useQuery({
    queryKey: ['analysts-active'],
    queryFn: async () => {
      const { data } = await supabase.from('analysts').select('*').eq('status', 'active').order('name');
      return data || [];
    },
  });

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['kanban-cards'],
    queryFn: async () => {
      const { data } = await supabase
        .from('kanban_cards')
        .select('*')
        .order('position');
      return data || [];
    },
  });

  const { data: labels = [] } = useQuery({
    queryKey: ['kanban-labels'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_labels').select('*').order('name');
      return data || [];
    },
  });

  const { data: cardLabels = [] } = useQuery({
    queryKey: ['kanban-card-labels'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_card_labels').select('*, kanban_labels(*)');
      return data || [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('kanban-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_cards' }, () => {
        queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const cardsByColumn = useMemo(() => {
    const map: Record<string, any[]> = {};
    COLUMNS.forEach(c => { map[c.id] = []; });
    cards.forEach((card: any) => {
      const col = map[card.status] || map['pending'];
      const cls = cardLabels.filter((cl: any) => cl.card_id === card.id);
      const analyst = analysts.find((a: any) => a.id === card.analyst_id);
      col.push({ ...card, labels: cls.map((cl: any) => cl.kanban_labels), analyst });
    });
    return map;
  }, [cards, cardLabels, analysts]);

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('kanban-images').upload(path, file);
    if (error) { toast.error('Erro ao fazer upload da imagem.'); return null; }
    const { data } = supabase.storage.from('kanban-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const createCard = useMutation({
    mutationFn: async () => {
      let imageUrl: string | null = null;
      if (imageFile) imageUrl = await uploadImage(imageFile);

      const colCards = cardsByColumn[targetColumn] || [];
      const position = colCards.length;

      const { data, error } = await supabase.from('kanban_cards').insert({
        title, description: description || null, status: targetColumn,
        position, analyst_id: analystId || null, image_url: imageUrl,
        created_by: user!.id,
      }).select().single();
      if (error) throw error;

      if (selectedLabels.length > 0) {
        await supabase.from('kanban_card_labels').insert(
          selectedLabels.map(lid => ({ card_id: data.id, label_id: lid }))
        );
      }
      await logActivity('Criou card no Kanban', title);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-card-labels'] });
      resetForm(); setCreateOpen(false);
      toast.success('Card criado!');
    },
    onError: () => toast.error('Erro ao criar card.'),
  });

  const updateCard = useMutation({
    mutationFn: async () => {
      if (!editingCard) return;
      let imageUrl = editingCard.image_url;
      if (imageFile) imageUrl = await uploadImage(imageFile);

      const { error } = await supabase.from('kanban_cards')
        .update({ title, description: description || null, analyst_id: analystId || null, image_url: imageUrl })
        .eq('id', editingCard.id);
      if (error) throw error;

      // Update labels
      await supabase.from('kanban_card_labels').delete().eq('card_id', editingCard.id);
      if (selectedLabels.length > 0) {
        await supabase.from('kanban_card_labels').insert(
          selectedLabels.map(lid => ({ card_id: editingCard.id, label_id: lid }))
        );
      }
      await logActivity('Editou card no Kanban', title);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-card-labels'] });
      resetForm(); setEditOpen(false);
      toast.success('Card atualizado!');
    },
    onError: () => toast.error('Erro ao atualizar card.'),
  });

  const deleteCard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kanban_cards').delete().eq('id', id);
      if (error) throw error;
      await logActivity('Excluiu card do Kanban');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
      toast.success('Card excluído!');
    },
  });

  const createLabel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('kanban_labels').insert({ name: newLabelName, color: newLabelColor });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-labels'] });
      setNewLabelName(''); setNewLabelColor('#3b82f6');
      toast.success('Etiqueta criada!');
    },
  });

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;

    const { error } = await supabase.from('kanban_cards')
      .update({ status: destination.droppableId, position: destination.index })
      .eq('id', draggableId);

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
    }
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setAnalystId('');
    setSelectedLabels([]); setImageFile(null); setEditingCard(null);
  };

  const openEdit = (card: any) => {
    setEditingCard(card);
    setTitle(card.title);
    setDescription(card.description || '');
    setAnalystId(card.analyst_id || '');
    setSelectedLabels((card.labels || []).map((l: any) => l.id));
    setEditOpen(true);
  };

  const openCreate = (colId: string) => {
    resetForm();
    setTargetColumn(colId);
    setCreateOpen(true);
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabels(prev => prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]);
  };

  const CardForm = ({ onSubmit, loading }: { onSubmit: () => void; loading: boolean }) => (
    <div className="space-y-3">
      <Input placeholder="Título" value={title} onChange={e => setTitle(e.target.value)} required />
      <Textarea placeholder="Descrição" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
      <Select value={analystId} onValueChange={setAnalystId}>
        <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
        <SelectContent>
          {analysts.map((a: any) => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {labels.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Etiquetas:</p>
          <div className="flex flex-wrap gap-1">
            {labels.map((l: any) => (
              <Badge
                key={l.id}
                variant={selectedLabels.includes(l.id) ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                style={selectedLabels.includes(l.id) ? { backgroundColor: l.color } : {}}
                onClick={() => toggleLabel(l.id)}
              >
                {l.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer">
          <ImagePlus className="h-3 w-3" /> Imagem
          <input type="file" accept="image/*" className="hidden" onChange={e => setImageFile(e.target.files?.[0] || null)} />
        </label>
        {imageFile && <p className="text-xs text-muted-foreground mt-1">{imageFile.name}</p>}
      </div>

      <Button onClick={onSubmit} disabled={loading || !title.trim()} className="w-full">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Salvar
      </Button>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Kanban Pendências</h1>
        <Button variant="outline" size="sm" onClick={() => setLabelOpen(true)}>
          <Tag className="h-4 w-4 mr-1" /> Etiquetas
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {COLUMNS.map(col => (
              <div key={col.id} className={`bg-muted/30 rounded-lg p-3 border-t-4 ${COLUMN_COLORS[col.id]} min-h-[300px]`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">{col.title}</h3>
                  <Badge variant="secondary" className="text-xs">{(cardsByColumn[col.id] || []).length}</Badge>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 min-h-[100px]">
                      {(cardsByColumn[col.id] || []).map((card: any, index: number) => (
                        <Draggable key={card.id} draggableId={card.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`bg-card rounded-md border p-3 shadow-sm space-y-2 ${snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-sm flex-1">{card.title}</p>
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => openEdit(card)} className="text-muted-foreground hover:text-primary">
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button onClick={() => deleteCard.mutate(card.id)} className="text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                              {card.description && <p className="text-xs text-muted-foreground line-clamp-2">{card.description}</p>}
                              {card.image_url && <img src={card.image_url} alt="" className="rounded-md w-full h-20 object-cover" />}
                              {card.labels?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {card.labels.map((l: any) => (
                                    <span key={l.id} className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: l.color }}>
                                      {l.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {card.analyst && (
                                <div className="flex items-center gap-1.5">
                                  <Avatar className="h-5 w-5">
                                    <AvatarImage src={card.analyst.photo_url || ''} />
                                    <AvatarFallback className="text-[8px]">{card.analyst.name?.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <span className="text-[10px] text-muted-foreground">{card.analyst.name}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
                <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => openCreate(col.id)}>
                  <Plus className="h-3 w-3 mr-1" /> Novo Card
                </Button>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Card</DialogTitle>
            <DialogDescription>Preencha os dados do card.</DialogDescription>
          </DialogHeader>
          <CardForm onSubmit={() => createCard.mutate()} loading={createCard.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Card</DialogTitle>
            <DialogDescription>Altere os dados do card.</DialogDescription>
          </DialogHeader>
          <CardForm onSubmit={() => updateCard.mutate()} loading={updateCard.isPending} />
        </DialogContent>
      </Dialog>

      {/* Label Manager Dialog */}
      <Dialog open={labelOpen} onOpenChange={setLabelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gerenciar Etiquetas</DialogTitle>
            <DialogDescription>Crie e organize etiquetas com cores.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Nome" value={newLabelName} onChange={e => setNewLabelName(e.target.value)} className="flex-1" />
              <input type="color" value={newLabelColor} onChange={e => setNewLabelColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0" />
              <Button size="sm" onClick={() => createLabel.mutate()} disabled={!newLabelName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              {labels.map((l: any) => (
                <div key={l.id} className="flex items-center gap-2 py-1">
                  <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  <span className="text-sm flex-1">{l.name}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Kanban;
