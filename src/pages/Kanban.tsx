import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { logActivity } from '@/hooks/useActivityLog';
import { notifySupportAnalyst } from '@/hooks/useDevNotifications';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Tag, Loader2, ImagePlus, X, Paperclip, ChevronLeft, ChevronRight, Download, Filter, ArrowLeft, ArrowRight, CheckCircle2, Calendar, Search } from 'lucide-react';
import { CardComments } from '@/components/CardComments';
import { CardChecklist } from '@/components/CardChecklist';
import { ChecklistBadge } from '@/components/ChecklistBadge';
import { KanbanSkeleton } from '@/components/KanbanSkeleton';
import { ImageLightbox } from '@/components/ImageLightbox';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLUMN_COLOR_OPTIONS = [
  'border-t-amber-500', 'border-t-blue-500', 'border-t-rose-500',
  'border-t-emerald-500', 'border-t-purple-500', 'border-t-orange-500',
  'border-t-cyan-500', 'border-t-pink-500', 'border-t-indigo-500',
];

const Kanban = () => {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const queryClient = useQueryClient();
  const [filterLabelIds, setFilterLabelIds] = useState<string[]>([]);
  const [filterAnalystIds, setFilterAnalystIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Column management state
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('border-t-blue-500');
  const [editColumnOpen, setEditColumnOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<any>(null);
  const [editColumnTitle, setEditColumnTitle] = useState('');
  const [editColumnColor, setEditColumnColor] = useState('');
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);

  const { data: columns = [] } = useQuery({
    queryKey: ['kanban-columns'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_columns').select('*').order('position');
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: analysts = [] } = useQuery({
    queryKey: ['analysts-active'],
    queryFn: async () => {
      const { data } = await supabase.from('analysts').select('*').eq('status', 'active').order('name');
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['kanban-cards'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_cards').select('*').order('position');
      return data || [];
    },
    staleTime: 60 * 1000,
  });

  const { data: labels = [] } = useQuery({
    queryKey: ['kanban-labels'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_labels').select('*').order('name');
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: cardLabels = [] } = useQuery({
    queryKey: ['kanban-card-labels'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_card_labels').select('*, kanban_labels(*)');
      return data || [];
    },
    staleTime: 60 * 1000,
  });

  const { data: cardImages = [] } = useQuery({
    queryKey: ['kanban-card-images'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_card_images').select('*').order('created_at');
      return data || [];
    },
    staleTime: 60 * 1000,
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_columns' }, () => {
        queryClient.invalidateQueries({ queryKey: ['kanban-columns'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const sortedColumns = useMemo(() => {
    return [...columns].sort((a: any, b: any) => a.position - b.position);
  }, [columns]);

  const cardsByColumn = useMemo(() => {
    const map: Record<string, any[]> = {};
    sortedColumns.forEach((c: any) => { map[c.slug] = []; });
    cards.forEach((card: any) => {
      const col = map[card.status];
      if (!col) { (map[sortedColumns[0]?.slug] || []).push(card); return; }
      const cls = cardLabels.filter((cl: any) => cl.card_id === card.id);
      const analyst = analysts.find((a: any) => a.id === card.analyst_id);
      const images = cardImages.filter((img: any) => img.card_id === card.id);
      const enriched = { ...card, labels: cls.map((cl: any) => cl.kanban_labels), analyst, images };
      // Apply label filter
      if (filterLabelIds.length > 0) {
        const cardLabelIds = cls.map((cl: any) => cl.label_id);
        if (!filterLabelIds.some(fid => cardLabelIds.includes(fid))) return;
      }
      // Apply analyst filter
      if (filterAnalystIds.length > 0) {
        if (!card.analyst_id || !filterAnalystIds.includes(card.analyst_id)) return;
      }
      // Apply text search (only on open/non-concluded cards)
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const slug = (card.status || '').toLowerCase();
        const isDone = slug.includes('conclu') || slug.includes('final') || slug.includes('done');
        if (isDone) return;
        if (!(card.title || '').toLowerCase().includes(q)) return;
      }
      col.push(enriched);
    });
    return map;
  }, [cards, cardLabels, analysts, cardImages, sortedColumns, filterLabelIds, filterAnalystIds, searchQuery]);

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

  // Resolve current user's display name once for notification labels
  const getActorName = useCallback(async (): Promise<string> => {
    if (!user) return 'Alguém';
    const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    return data?.display_name || user.email?.split('@')[0] || 'Alguém';
  }, [user]);

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
      // Notify analyst on assignment
      if (analystId) {
        const actorName = await getActorName();
        await notifySupportAnalyst({
          cardId: data.id, cardTitle: title, analystId,
          actionType: 'assignee', actorId: user?.id, actorName,
          message: `${actorName} criou o ticket "${title}" e atribuiu para você`,
        });
      }
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
      const prevAnalystId = editingCard.analyst_id || null;
      const newAnalystId = analystId || null;
      const { error } = await supabase.from('kanban_cards')
        .update({ title, description: description || null, analyst_id: newAnalystId })
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
      // Notifications
      const actorName = await getActorName();
      if (newAnalystId && newAnalystId !== prevAnalystId) {
        await notifySupportAnalyst({
          cardId: editingCard.id, cardTitle: title, analystId: newAnalystId,
          actionType: 'assignee', actorId: user?.id, actorName,
          message: `${actorName} atribuiu o ticket "${title}" para você`,
        });
      } else if (newAnalystId) {
        await notifySupportAnalyst({
          cardId: editingCard.id, cardTitle: title, analystId: newAnalystId,
          actionType: 'edit', actorId: user?.id, actorName,
          message: `${actorName} editou o ticket "${title}"`,
        });
      }
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

  // --- Column mutations ---
  const addColumn = useMutation({
    mutationFn: async () => {
      const slug = newColumnTitle.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();
      const position = sortedColumns.length;
      const { error } = await supabase.from('kanban_columns').insert({
        title: newColumnTitle, slug, position, color: newColumnColor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-columns'] });
      setNewColumnTitle(''); setNewColumnColor('border-t-blue-500');
      setAddColumnOpen(false);
      toast.success('Lista criada!');
    },
    onError: () => toast.error('Erro ao criar lista.'),
  });

  const editColumn = useMutation({
    mutationFn: async () => {
      if (!editingColumn) return;
      const { error } = await supabase.from('kanban_columns')
        .update({ title: editColumnTitle, color: editColumnColor })
        .eq('id', editingColumn.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-columns'] });
      setEditColumnOpen(false); setEditingColumn(null);
      toast.success('Lista atualizada!');
    },
  });

  const removeColumn = useMutation({
    mutationFn: async (id: string) => {
      const col = sortedColumns.find((c: any) => c.id === id);
      if (!col) return;
      // Move cards from deleted column to first column
      const firstCol = sortedColumns.find((c: any) => c.id !== id);
      if (firstCol) {
        await supabase.from('kanban_cards').update({ status: firstCol.slug }).eq('status', col.slug);
      }
      const { error } = await supabase.from('kanban_columns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-columns'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
      setDeleteColumnId(null);
      toast.success('Lista excluída!');
    },
  });

  // Helper: detecta se um slug de coluna representa "Concluídos"
  const isDoneSlug = (slug: string) => {
    const s = (slug || '').toLowerCase();
    return s.includes('conclu') || s.includes('final') || s.includes('done');
  };

  // Helper: garante existência da etiqueta "Concluído" e retorna seu id
  const ensureDoneLabel = useCallback(async (): Promise<string | null> => {
    const existing = (labels as any[]).find((l: any) => (l.name || '').toLowerCase() === 'concluído' || (l.name || '').toLowerCase() === 'concluido');
    if (existing) return existing.id;
    const { data, error } = await supabase.from('kanban_labels')
      .insert({ name: 'Concluído', color: '#10b981' })
      .select().single();
    if (error || !data) return null;
    queryClient.invalidateQueries({ queryKey: ['kanban-labels'] });
    return data.id;
  }, [labels, queryClient]);

  // Aplica regra automática de etiquetas ao mover entre colunas
  const applyDoneLabelRule = useCallback(async (cardId: string, fromSlug: string, toSlug: string) => {
    const movedToDone = !isDoneSlug(fromSlug) && isDoneSlug(toSlug);
    const movedFromDone = isDoneSlug(fromSlug) && !isDoneSlug(toSlug);
    if (!movedToDone && !movedFromDone) return;

    if (movedToDone) {
      const doneLabelId = await ensureDoneLabel();
      if (!doneLabelId) return;
      // Remove todas as etiquetas e adiciona apenas "Concluído"
      await supabase.from('kanban_card_labels').delete().eq('card_id', cardId);
      await supabase.from('kanban_card_labels').insert({ card_id: cardId, label_id: doneLabelId });
    } else if (movedFromDone) {
      // Remove apenas a etiqueta "Concluído" (não restaura antigas)
      const doneLabelId = await ensureDoneLabel();
      if (!doneLabelId) return;
      await supabase.from('kanban_card_labels').delete()
        .eq('card_id', cardId).eq('label_id', doneLabelId);
    }
    queryClient.invalidateQueries({ queryKey: ['kanban-card-labels'] });
  }, [ensureDoneLabel, queryClient]);

  // --- Optimistic drag and drop ---
  const onDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const movedCard = cards.find((c: any) => c.id === draggableId);
    const statusChanged = source.droppableId !== destination.droppableId;

    // Optimistic update: immediately update the cache
    queryClient.setQueryData(['kanban-cards'], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map(card =>
        card.id === draggableId
          ? { ...card, status: destination.droppableId, position: destination.index }
          : card
      );
    });

    // Persist in background
    supabase.from('kanban_cards')
      .update({ status: destination.droppableId, position: destination.index })
      .eq('id', draggableId)
      .then(async ({ error }) => {
        if (error) {
          // Rollback on error
          queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
          toast.error('Erro ao mover card.');
          return;
        }
        // Regra automática de etiquetas para coluna "Concluídos"
        if (statusChanged) {
          await applyDoneLabelRule(draggableId, source.droppableId, destination.droppableId);
        }
        // Notify analyst on column change
        if (statusChanged && movedCard?.analyst_id) {
          const colTitle = (columns as any[]).find(c => c.slug === destination.droppableId)?.title || destination.droppableId;
          const actorName = await getActorName();
          await notifySupportAnalyst({
            cardId: movedCard.id, cardTitle: movedCard.title, analystId: movedCard.analyst_id,
            actionType: 'status', actorId: user?.id, actorName,
            message: `${actorName} moveu o ticket "${movedCard.title}" para "${colTitle}"`,
          });
        }
      });
  }, [queryClient, cards, columns, getActorName, user?.id, applyDoneLabelRule]);

  // Auto-open a card when navigated with ?card=<id> (e.g., from notifications)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const cardParam = searchParams.get('card');
    if (!cardParam || cards.length === 0) return;
    const target = cards.find((c: any) => c.id === cardParam);
    if (target) {
      setViewingCard(target);
      setViewOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('card');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, cards, setSearchParams]);

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

  const openCreate = (colSlug: string) => {
    resetForm();
    setTargetColumn(colSlug);
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

  const openEditColumn = (col: any) => {
    setEditingColumn(col);
    setEditColumnTitle(col.title);
    setEditColumnColor(col.color);
    setEditColumnOpen(true);
  };

  const viewingCardImages = useMemo(() => {
    if (!viewingCard) return [];
    return cardImages.filter((img: any) => img.card_id === viewingCard.id);
  }, [viewingCard, cardImages]);

  const editingCardImages = useMemo(() => {
    if (!editingCard) return [];
    return cardImages.filter((img: any) => img.card_id === editingCard.id);
  }, [editingCard, cardImages]);

  // Column reorder (admin only)
  const moveColumn = useCallback(async (colId: string, direction: 'left' | 'right') => {
    const idx = sortedColumns.findIndex((c: any) => c.id === colId);
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedColumns.length) return;
    const a = sortedColumns[idx];
    const b = sortedColumns[swapIdx];
    // Optimistic
    queryClient.setQueryData(['kanban-columns'], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map(c => c.id === a.id ? { ...c, position: b.position } : c.id === b.id ? { ...c, position: a.position } : c);
    });
    await Promise.all([
      supabase.from('kanban_columns').update({ position: b.position }).eq('id', a.id),
      supabase.from('kanban_columns').update({ position: a.position }).eq('id', b.id),
    ]);
    queryClient.invalidateQueries({ queryKey: ['kanban-columns'] });
  }, [sortedColumns, queryClient]);

  const toggleFilterLabel = useCallback((labelId: string) => {
    setFilterLabelIds(prev => prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]);
  }, []);

  const toggleFilterAnalyst = useCallback((analystId: string) => {
    setFilterAnalystIds(prev => prev.includes(analystId) ? prev.filter(id => id !== analystId) : [...prev, analystId]);
  }, []);

  const gridCols = sortedColumns.length <= 3
    ? 'lg:grid-cols-3'
    : sortedColumns.length <= 4
    ? 'lg:grid-cols-4'
    : 'lg:grid-cols-4';

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Kanban Pendências</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setLabelOpen(true)}>
            <Tag className="h-4 w-4 mr-1" /> Etiquetas
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddColumnOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar lista
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente ou título..."
            className="h-8 pl-8 pr-8 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {labels.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-8">
                <Filter className="h-3.5 w-3.5 mr-1" />
                Etiquetas
                {filterLabelIds.length > 0 && (
                  <Badge variant="default" className="ml-1.5 h-5 px-1.5 text-[10px]">{filterLabelIds.length}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="flex flex-col gap-1">
                {labels.map((l: any) => (
                  <button
                    key={l.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors text-left ${filterLabelIds.includes(l.id) ? 'bg-accent font-medium' : ''}`}
                    onClick={() => toggleFilterLabel(l.id)}
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </button>
                ))}
                {filterLabelIds.length > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-7 mt-1" onClick={() => setFilterLabelIds([])}>
                    <X className="h-3 w-3 mr-1" /> Limpar
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
        {analysts.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-8">
                <Filter className="h-3.5 w-3.5 mr-1" />
                Analista
                {filterAnalystIds.length > 0 && (
                  <Badge variant="default" className="ml-1.5 h-5 px-1.5 text-[10px]">{filterAnalystIds.length}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="flex flex-col gap-1">
                {analysts.map((a: any) => (
                  <button
                    key={a.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors text-left ${filterAnalystIds.includes(a.id) ? 'bg-accent font-medium' : ''}`}
                    onClick={() => toggleFilterAnalyst(a.id)}
                  >
                    {a.name}
                  </button>
                ))}
                {filterAnalystIds.length > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-7 mt-1" onClick={() => setFilterAnalystIds([])}>
                    <X className="h-3 w-3 mr-1" /> Limpar
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {isLoading ? (
        <div className="px-2"><KanbanSkeleton columns={Math.max(sortedColumns.length, 4)} /></div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} gap-4`} style={sortedColumns.length > 4 ? { gridTemplateColumns: `repeat(${sortedColumns.length}, minmax(280px, 1fr))`, overflowX: 'auto' } : undefined}>
            {sortedColumns.map((col: any, colIdx: number) => (
              <div key={col.id} className={`bg-muted/30 rounded-lg p-3 border-t-4 ${col.color} min-h-[300px] flex flex-col`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">{col.title}</h3>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="text-xs">{(cardsByColumn[col.slug] || []).length}</Badge>
                    {isAdmin && colIdx > 0 && (
                      <button onClick={() => moveColumn(col.id, 'left')} className="text-muted-foreground hover:text-primary">
                        <ArrowLeft className="h-3 w-3" />
                      </button>
                    )}
                    {isAdmin && colIdx < sortedColumns.length - 1 && (
                      <button onClick={() => moveColumn(col.id, 'right')} className="text-muted-foreground hover:text-primary">
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                    <button onClick={() => openEditColumn(col)} className="text-muted-foreground hover:text-primary">
                      <Pencil className="h-3 w-3" />
                    </button>
                    {sortedColumns.length > 1 && (
                      <button onClick={() => setDeleteColumnId(col.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <Droppable droppableId={col.slug}>
                  {(provided) => (
                    <ScrollArea className="flex-1" style={{ maxHeight: '400px' }}>
                      <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 min-h-[100px] pr-2">
                        {(cardsByColumn[col.slug] || []).map((card: any, index: number) => (
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
                                <p className="font-medium text-sm flex-1 flex items-center gap-1">
                                      {card.status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                                      {card.title}
                                    </p>
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
                                  <ChecklistBadge cardId={card.id} cardType="kanban" />
                                </div>
                                <div className="flex items-center justify-between">
                                  {card.analyst && (
                                    <div className="flex items-center gap-1.5">
                                      <Avatar className="h-5 w-5">
                                        <AvatarImage src={card.analyst.photo_url || ''} />
                                        <AvatarFallback className="text-[8px]">{card.analyst.name?.charAt(0)}</AvatarFallback>
                                      </Avatar>
                                      <span className="text-[10px] text-muted-foreground">{card.analyst.name}</span>
                                    </div>
                                  )}
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(card.created_at), 'dd/MM HH:mm')}
                                  </span>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </ScrollArea>
                  )}
                </Droppable>
                <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => openCreate(col.slug)}>
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
              {sortedColumns.find((c: any) => c.slug === viewingCard?.status)?.title}
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
              <div className="flex items-center gap-4 flex-wrap">
                {viewingCard.analyst && (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={viewingCard.analyst.photo_url || ''} />
                      <AvatarFallback className="text-xs">{viewingCard.analyst.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-muted-foreground">{viewingCard.analyst.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Criado em: {format(new Date(viewingCard.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                </div>
              </div>
              <CardChecklist cardId={viewingCard.id} cardType="kanban" description={viewingCard.description} />
              <CardComments cardId={viewingCard.id} />
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

      {/* Add Column Dialog */}
      <Dialog open={addColumnOpen} onOpenChange={setAddColumnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Lista</DialogTitle>
            <DialogDescription>Crie uma nova coluna no Kanban.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome da lista" value={newColumnTitle} onChange={e => setNewColumnTitle(e.target.value)} />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Cor da borda:</p>
              <div className="flex flex-wrap gap-2">
                {COLUMN_COLOR_OPTIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColumnColor(c)}
                    className={`w-8 h-8 rounded-full border-2 border-t-4 ${c} ${newColumnColor === c ? 'ring-2 ring-primary ring-offset-2' : 'border-muted'}`}
                  />
                ))}
              </div>
            </div>
            <Button onClick={() => addColumn.mutate()} disabled={!newColumnTitle.trim() || addColumn.isPending} className="w-full">
              {addColumn.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Lista
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Column Dialog */}
      <Dialog open={editColumnOpen} onOpenChange={setEditColumnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Lista</DialogTitle>
            <DialogDescription>Altere o nome ou cor da lista.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome da lista" value={editColumnTitle} onChange={e => setEditColumnTitle(e.target.value)} />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Cor da borda:</p>
              <div className="flex flex-wrap gap-2">
                {COLUMN_COLOR_OPTIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => setEditColumnColor(c)}
                    className={`w-8 h-8 rounded-full border-2 border-t-4 ${c} ${editColumnColor === c ? 'ring-2 ring-primary ring-offset-2' : 'border-muted'}`}
                  />
                ))}
              </div>
            </div>
            <Button onClick={() => editColumn.mutate()} disabled={!editColumnTitle.trim() || editColumn.isPending} className="w-full">
              {editColumn.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Column */}
      <AlertDialog open={!!deleteColumnId} onOpenChange={() => setDeleteColumnId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Os cards desta lista serão movidos para a primeira coluna. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteColumnId && removeColumn.mutate(deleteColumnId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
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
