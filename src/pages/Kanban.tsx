import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logActivity } from '@/hooks/useActivityLog';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Tag, Loader2, ImagePlus, X, Paperclip, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [viewOpen, setViewOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [targetColumn, setTargetColumn] = useState('pending');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [analystId, setAnalystId] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [editingCard, setEditingCard] = useState<any>(null);
  const [viewingCard, setViewingCard] = useState<any>(null);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');
  const [editingLabel, setEditingLabel] = useState<any>(null);
  const [editLabelName, setEditLabelName] = useState('');
  const [editLabelColor, setEditLabelColor] = useState('#3b82f6');
  const [deleteLabelId, setDeleteLabelId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);

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
      const { data } = await supabase.from('kanban_cards').select('*').order('position');
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

  const { data: cardImages = [] } = useQuery({
    queryKey: ['kanban-card-images'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_card_images').select('*').order('created_at');
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('kanban-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_cards' }, () => {
        queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_card_images' }, () => {
        queryClient.invalidateQueries({ queryKey: ['kanban-card-images'] });
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
      const images = cardImages.filter((img: any) => img.card_id === card.id);
      col.push({ ...card, labels: cls.map((cl: any) => cl.kanban_labels), analyst, images });
    });
    return map;
  }, [cards, cardLabels, analysts, cardImages]);

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name?.split('.').pop() || 'png';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('kanban-images').upload(path, file);
    if (error) { toast.error('Erro ao fazer upload da imagem.'); return null; }
    const { data } = supabase.storage.from('kanban-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const uploadAndSaveImages = async (cardId: string, files: File[]) => {
    for (const file of files) {
      const url = await uploadImage(file);
      if (url) {
        await supabase.from('kanban_card_images').insert({ card_id: cardId, image_url: url });
      }
    }
  };

  const createCard = useMutation({
    mutationFn: async () => {
      const colCards = cardsByColumn[targetColumn] || [];
      const position = colCards.length;
      const { data, error } = await supabase.from('kanban_cards').insert({
        title, description: description || null, status: targetColumn,
        position, analyst_id: analystId || null, image_url: null,
        created_by: user!.id,
      }).select().single();
      if (error) throw error;
      if (selectedLabels.length > 0) {
        await supabase.from('kanban_card_labels').insert(
          selectedLabels.map(lid => ({ card_id: data.id, label_id: lid }))
        );
      }
      if (pendingImages.length > 0) {
        await uploadAndSaveImages(data.id, pendingImages);
      }
      await logActivity('Criou card no Kanban', title);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-card-labels'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-card-images'] });
      resetForm(); setCreateOpen(false);
      toast.success('Card criado!');
    },
    onError: () => toast.error('Erro ao criar card.'),
  });

  const updateCard = useMutation({
    mutationFn: async () => {
      if (!editingCard) return;
      const { error } = await supabase.from('kanban_cards')
        .update({ title, description: description || null, analyst_id: analystId || null })
        .eq('id', editingCard.id);
      if (error) throw error;
      await supabase.from('kanban_card_labels').delete().eq('card_id', editingCard.id);
      if (selectedLabels.length > 0) {
        await supabase.from('kanban_card_labels').insert(
          selectedLabels.map(lid => ({ card_id: editingCard.id, label_id: lid }))
        );
      }
      if (pendingImages.length > 0) {
        await uploadAndSaveImages(editingCard.id, pendingImages);
      }
      await logActivity('Editou card no Kanban', title);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-card-labels'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-card-images'] });
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

  const deleteImage = useMutation({
    mutationFn: async (imageId: string) => {
      const { error } = await supabase.from('kanban_card_images').delete().eq('id', imageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-card-images'] });
      toast.success('Imagem removida!');
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

  const updateLabel = useMutation({
    mutationFn: async () => {
      if (!editingLabel) return;
      const { error } = await supabase.from('kanban_labels')
        .update({ name: editLabelName, color: editLabelColor })
        .eq('id', editingLabel.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-labels'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-card-labels'] });
      setEditingLabel(null);
      toast.success('Etiqueta atualizada!');
    },
  });

  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('kanban_card_labels').delete().eq('label_id', id);
      const { error } = await supabase.from('kanban_labels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-labels'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-card-labels'] });
      setDeleteLabelId(null);
      toast.success('Etiqueta excluída!');
    },
  });

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const { destination, draggableId } = result;
    const { error } = await supabase.from('kanban_cards')
      .update({ status: destination.droppableId, position: destination.index })
      .eq('id', draggableId);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
    }
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setAnalystId('');
    setSelectedLabels([]); setPendingImages([]); setEditingCard(null);
  };

  const openEdit = (card: any) => {
    setEditingCard(card);
    setTitle(card.title);
    setDescription(card.description || '');
    setAnalystId(card.analyst_id || '');
    setSelectedLabels((card.labels || []).map((l: any) => l.id));
    setPendingImages([]);
    setEditOpen(true);
  };

  const openView = (card: any) => {
    setViewingCard(card);
    setViewOpen(true);
  };

  const openCreate = (colId: string) => {
    resetForm();
    setTargetColumn(colId);
    setCreateOpen(true);
  };

  const toggleLabel = useCallback((labelId: string) => {
    setSelectedLabels(prev => prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]);
  }, []);

  const startEditLabel = (label: any) => {
    setEditingLabel(label);
    setEditLabelName(label.name);
    setEditLabelColor(label.color);
  };

  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
  };

  // Get images for the viewing card (live from query data)
  const viewingCardImages = useMemo(() => {
    if (!viewingCard) return [];
    return cardImages.filter((img: any) => img.card_id === viewingCard.id);
  }, [viewingCard, cardImages]);

  // Get images for the editing card (live from query data)
  const editingCardImages = useMemo(() => {
    if (!editingCard) return [];
    return cardImages.filter((img: any) => img.card_id === editingCard.id);
  }, [editingCard, cardImages]);

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
                              onClick={() => openView(card)}
                              className={`bg-card rounded-md border p-3 shadow-sm space-y-2 cursor-pointer hover:shadow-md transition-shadow ${snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-sm flex-1">{card.title}</p>
                                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => openEdit(card)} className="text-muted-foreground hover:text-primary">
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button onClick={() => deleteCard.mutate(card.id)} className="text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                              {card.description && <p className="text-xs text-muted-foreground line-clamp-2">{card.description}</p>}
                              <div className="flex items-center gap-2 flex-wrap">
                                {card.labels?.length > 0 && card.labels.map((l: any) => (
                                  <span key={l.id} className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: l.color }}>
                                    {l.name}
                                  </span>
                                ))}
                                {card.images?.length > 0 && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                    <Paperclip className="h-3 w-3" /> {card.images.length}
                                  </span>
                                )}
                              </div>
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

      {/* View Card Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-lg sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingCard?.title}</DialogTitle>
            <DialogDescription>
              {COLUMNS.find(c => c.id === viewingCard?.status)?.title}
            </DialogDescription>
          </DialogHeader>
          {viewingCard && (
            <div className="space-y-4">
              {viewingCard.description && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm whitespace-pre-wrap">{viewingCard.description}</p>
                </div>
              )}
              {viewingCardImages.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Imagens ({viewingCardImages.length})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {viewingCardImages.map((img: any, i: number) => (
                      <img
                        key={img.id}
                        src={img.image_url}
                        alt=""
                        className="rounded-lg w-full h-32 object-cover border cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => openLightbox(viewingCardImages.map((im: any) => im.image_url), i)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {viewingCard.labels?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Etiquetas</p>
                  <div className="flex flex-wrap gap-1">
                    {viewingCard.labels.map((l: any) => (
                      <span key={l.id} className="text-xs px-2 py-1 rounded-full text-white" style={{ backgroundColor: l.color }}>
                        {l.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {viewingCard.analyst && (
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={viewingCard.analyst.photo_url || ''} />
                    <AvatarFallback className="text-xs">{viewingCard.analyst.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground">{viewingCard.analyst.name}</span>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => { setViewOpen(false); openEdit(viewingCard); }}>
                  <Pencil className="h-3 w-3 mr-1" /> Editar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Novo Card</DialogTitle>
            <DialogDescription>Preencha os dados do card.</DialogDescription>
          </DialogHeader>
          <CardFormContent
            title={title} setTitle={setTitle}
            description={description} setDescription={setDescription}
            analystId={analystId} setAnalystId={setAnalystId}
            analysts={analysts} labels={labels}
            selectedLabels={selectedLabels} toggleLabel={toggleLabel}
            pendingImages={pendingImages} setPendingImages={setPendingImages}
            existingImages={[]}
            onDeleteImage={() => {}}
            onSubmit={() => createCard.mutate()} loading={createCard.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg sm:max-w-2xl max-h-[85vh] overflow-y-auto" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Editar Card</DialogTitle>
            <DialogDescription>Altere os dados do card.</DialogDescription>
          </DialogHeader>
          <CardFormContent
            title={title} setTitle={setTitle}
            description={description} setDescription={setDescription}
            analystId={analystId} setAnalystId={setAnalystId}
            analysts={analysts} labels={labels}
            selectedLabels={selectedLabels} toggleLabel={toggleLabel}
            pendingImages={pendingImages} setPendingImages={setPendingImages}
            existingImages={editingCardImages}
            onDeleteImage={(id) => deleteImage.mutate(id)}
            onSubmit={() => updateCard.mutate()} loading={updateCard.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Label Manager Dialog */}
      <Dialog open={labelOpen} onOpenChange={setLabelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gerenciar Etiquetas</DialogTitle>
            <DialogDescription>Crie, edite e exclua etiquetas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Nome" value={newLabelName} onChange={e => setNewLabelName(e.target.value)} className="flex-1" />
              <input type="color" value={newLabelColor} onChange={e => setNewLabelColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0" />
              <Button size="sm" onClick={() => createLabel.mutate()} disabled={!newLabelName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {labels.map((l: any) => (
                <div key={l.id}>
                  {editingLabel?.id === l.id ? (
                    <div className="flex items-center gap-2 py-1">
                      <Input value={editLabelName} onChange={e => setEditLabelName(e.target.value)} className="flex-1 h-8 text-sm" />
                      <input type="color" value={editLabelColor} onChange={e => setEditLabelColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => updateLabel.mutate()} disabled={!editLabelName.trim()}>
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingLabel(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-1">
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                      <span className="text-sm flex-1">{l.name}</span>
                      <button onClick={() => startEditLabel(l)} className="text-muted-foreground hover:text-primary">
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button onClick={() => setDeleteLabelId(l.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Label */}
      <AlertDialog open={!!deleteLabelId} onOpenChange={() => setDeleteLabelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir etiqueta?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação removerá a etiqueta de todos os cards vinculados. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteLabelId && deleteLabel.mutate(deleteLabelId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Dialog open={true} onOpenChange={() => setLightboxIndex(null)}>
          <DialogContent className="max-w-4xl p-2 bg-black/90 border-none">
            <DialogHeader className="sr-only">
              <DialogTitle>Visualizar imagem</DialogTitle>
              <DialogDescription>Imagem {(lightboxIndex || 0) + 1} de {lightboxImages.length}</DialogDescription>
            </DialogHeader>
            <div className="relative flex items-center justify-center min-h-[60vh]">
              <img
                src={lightboxImages[lightboxIndex]}
                alt=""
                className="max-h-[80vh] max-w-full object-contain rounded"
              />
              {lightboxImages.length > 1 && (
                <>
                  <button
                    onClick={() => setLightboxIndex((lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white rounded-full p-2"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={() => setLightboxIndex((lightboxIndex + 1) % lightboxImages.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white rounded-full p-2"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>
            <p className="text-center text-white/60 text-xs">{lightboxIndex + 1} / {lightboxImages.length}</p>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

/* Extracted as a stable component to prevent focus loss */
function CardFormContent({
  title, setTitle, description, setDescription,
  analystId, setAnalystId, analysts, labels,
  selectedLabels, toggleLabel,
  pendingImages, setPendingImages,
  existingImages, onDeleteImage,
  onSubmit, loading,
}: {
  title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  analystId: string; setAnalystId: (v: string) => void;
  analysts: any[]; labels: any[];
  selectedLabels: string[]; toggleLabel: (id: string) => void;
  pendingImages: File[]; setPendingImages: (f: File[]) => void;
  existingImages: any[];
  onDeleteImage: (id: string) => void;
  onSubmit: () => void; loading: boolean;
}) {
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const newFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) newFiles.push(file);
      }
    }
    if (newFiles.length > 0) {
      e.preventDefault();
      setPendingImages([...pendingImages, ...newFiles]);
      toast.success(`${newFiles.length} imagem(ns) colada(s)!`);
    }
  }, [pendingImages, setPendingImages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingImages([...pendingImages, ...files]);
    }
    e.target.value = '';
  };

  const removePending = (index: number) => {
    setPendingImages(pendingImages.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3" onPaste={handlePaste}>
      <Input
        placeholder="Título"
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoComplete="off"
      />
      <Textarea
        placeholder="Observações (use CTRL+V para colar imagens)"
        value={description}
        onChange={e => setDescription(e.target.value)}
        rows={4}
        className="resize-y"
      />
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

      {/* Existing images */}
      {existingImages.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Imagens anexadas:</p>
          <div className="grid grid-cols-3 gap-2">
            {existingImages.map((img: any) => (
              <div key={img.id} className="relative group">
                <img src={img.image_url} alt="" className="rounded-md w-full h-20 object-cover border" />
                <button
                  onClick={() => onDeleteImage(img.id)}
                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending images (not yet uploaded) */}
      {pendingImages.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Novas imagens ({pendingImages.length}):</p>
          <div className="grid grid-cols-3 gap-2">
            {pendingImages.map((file, i) => (
              <div key={i} className="relative group">
                <img src={URL.createObjectURL(file)} alt="" className="rounded-md w-full h-20 object-cover border" />
                <button
                  onClick={() => removePending(i)}
                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
          <ImagePlus className="h-3 w-3" /> Adicionar imagens
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
        </label>
        <span className="text-[10px] text-muted-foreground">ou CTRL+V para colar</span>
      </div>

      <Button onClick={onSubmit} disabled={loading || !title.trim()} className="w-full">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Salvar
      </Button>
    </div>
  );
}

export default Kanban;
