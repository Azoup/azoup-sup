import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useSupabaseReady } from '@/hooks/useSupabaseReady';
import { useDevKanbanBoard, refreshDevKanbanBoard, flushDevKanbanBoardRefresh } from '@/hooks/useDevKanbanBoard';
import { clearDevKanbanBoardCache } from '@/lib/devKanbanBoardCache';
import { isSupabaseLockError, withSupabaseRetry } from '@/lib/supabaseRetry';
import {
  patchDevKanbanBoardCards,
  patchDevKanbanBoardCardLabels,
  patchDevKanbanBoardCardImages,
  patchDevKanbanBoardColumns,
  DEV_KANBAN_BOARD_QUERY_KEY,
} from '@/lib/devKanbanBoardPatch';
import { uploadKanbanImagesParallel } from '@/lib/uploadKanbanCardAssets';
import { uploadKanbanFileForCard } from '@/lib/uploadKanbanFile';
import {
  dedupeCardLabelRows,
  labelsForCardFromRows,
  syncCardLabels,
  uniqueLabelIds,
} from '@/lib/kanbanCardLabels';
import { useChecklistProgressMap } from '@/hooks/useChecklistProgressMap';
import { markBoardLocalWrite } from '@/lib/boardRefreshGuard';
import { isDevKanbanCardFormDirty } from '@/lib/kanbanCardFormDirty';
import { logActivity } from '@/hooks/useActivityLog';
import { notifyDevAndAnalyst } from '@/hooks/useDevNotifications';
import { KanbanCardImage } from '@/components/KanbanCardImage';
import { filesFromClipboardData } from '@/lib/clipboardImage';
import { loadDevKanbanDevNotes, saveDevKanbanDevNotes } from '@/lib/devKanbanDevNotes';
import { devTicketLabel, devTicketMatchesSearch, isDevTicketNumberQuery } from '@/lib/devKanbanTicketNumber';
import { isKanbanCompletionSlug, resolveCompletionColumnSlug } from '@/lib/kanbanCompletionColumn';
import { computeKanbanDragPositionUpdates, sortKanbanCardsByPosition } from '@/lib/kanbanCardReorder';
import { persistDevKanbanCardPositions } from '@/lib/persistDevKanbanCardPositions';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Tag, Loader2, ImagePlus, X, Paperclip, ChevronLeft, ChevronRight, Download, Filter, ArrowLeft, ArrowRight, CheckCircle2, Calendar, Search, GripVertical } from 'lucide-react';
import { DevCardComments } from '@/components/DevCardComments';
import { DevTicketNumberBadge } from '@/components/DevTicketNumberBadge';
import { DevCardFiles } from '@/components/DevCardFiles';
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

const KanbanDev = () => {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const { ready: supabaseReady } = useSupabaseReady();
  const queryClient = useQueryClient();
  const actorName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Alguém';
  const [filterLabelIds, setFilterLabelIds] = useState<string[]>([]);
  const [filterAnalystIds, setFilterAnalystIds] = useState<string[]>([]);
  const [filterDevIds, setFilterDevIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [targetColumn, setTargetColumn] = useState('backlog');
  const [moveToColumnSlug, setMoveToColumnSlug] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [devNotes, setDevNotes] = useState('');
  const [analystId, setAnalystId] = useState('');
  const [developerId, setDeveloperId] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [editingCard, setEditingCard] = useState<any>(null);
  const [viewingCard, setViewingCard] = useState<any>(null);
  const [viewingDevNotes, setViewingDevNotes] = useState('');
  const initialDevNotesRef = useRef('');
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');
  const [editingLabel, setEditingLabel] = useState<any>(null);
  const [editLabelName, setEditLabelName] = useState('');
  const [editLabelColor, setEditLabelColor] = useState('#3b82f6');
  const [deleteLabelId, setDeleteLabelId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);

  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('border-t-blue-500');
  const [editColumnOpen, setEditColumnOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<any>(null);
  const [editColumnTitle, setEditColumnTitle] = useState('');
  const [editColumnColor, setEditColumnColor] = useState('');
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);
  const dragBusyRef = useRef(false);
  const ticketNumberRefetchDone = useRef(false);

  const { data: board, isLoading: boardLoading } = useDevKanbanBoard(supabaseReady);
  const columns = (board?.columns ?? []) as any[];
  const analysts = (board?.analysts ?? []) as any[];
  const developers = (board?.developers ?? []) as any[];
  const cards = (board?.cards ?? []) as any[];
  const labels = (board?.labels ?? []) as any[];
  const cardLabels = dedupeCardLabelRows((board?.cardLabels ?? []) as { card_id: string; label_id: string }[]);
  const cardImages = (board?.cardImages ?? []) as any[];
  const isLoading = boardLoading && !board;
  const checklistProgress = useChecklistProgressMap('dev', supabaseReady && !!board);

  useEffect(() => {
    if (!board?.cards?.length || boardLoading || ticketNumberRefetchDone.current) return;
    const hasTicketNumber = (board.cards as { ticket_number?: number | null }[]).some(
      (c) => c.ticket_number != null,
    );
    if (!hasTicketNumber) {
      ticketNumberRefetchDone.current = true;
      clearDevKanbanBoardCache();
      flushDevKanbanBoardRefresh(queryClient);
    }
  }, [board?.cards, boardLoading, queryClient]);

  const sortedColumns = useMemo(() => [...columns].sort((a: any, b: any) => a.position - b.position), [columns]);

  const completionColumnSlug = useMemo(
    () => resolveCompletionColumnSlug(sortedColumns, 'dev'),
    [sortedColumns],
  );

  const isDoneSlug = useCallback(
    (slug: string) => isKanbanCompletionSlug(slug, completionColumnSlug),
    [completionColumnSlug],
  );

  const cardsByColumn = useMemo(() => {
    const map: Record<string, any[]> = {};
    sortedColumns.forEach((c: any) => { map[c.slug] = []; });
    cards.forEach((card: any) => {
      const col = map[card.status];
      if (!col) { (map[sortedColumns[0]?.slug] || []).push(card); return; }
      const cls = cardLabels.filter((cl: any) => cl.card_id === card.id);
      const analyst = analysts.find((a: any) => a.id === card.analyst_id);
      const developer = developers.find((d: any) => d.id === card.developer_id);
      const images = cardImages.filter((img: any) => img.card_id === card.id);
      const enriched = {
        ...card,
        labels: labelsForCardFromRows(cls as { label_id: string; dev_kanban_labels?: unknown }[]),
        analyst,
        developer,
        images,
      };
      if (filterLabelIds.length > 0) {
        const cardLabelIds = cls.map((cl: any) => cl.label_id);
        if (!filterLabelIds.some(fid => cardLabelIds.includes(fid))) return;
      }
      if (filterAnalystIds.length > 0) {
        if (!card.analyst_id || !filterAnalystIds.includes(card.analyst_id)) return;
      }
      if (filterDevIds.length > 0) {
        if (!card.developer_id || !filterDevIds.includes(card.developer_id)) return;
      }
      const q = searchQuery.trim();
      if (q) {
        if (isDevTicketNumberQuery(q)) {
          if (card.ticket_number == null || !devTicketMatchesSearch(card.ticket_number, q)) return;
        } else {
          const qLower = q.toLowerCase();
          const titleMatch = (card.title || '').toLowerCase().includes(qLower);
          const descMatch = (card.description || '').toLowerCase().includes(qLower);
          if (!titleMatch && !descMatch) return;
          if (isKanbanCompletionSlug(card.status, completionColumnSlug)) return;
        }
      }
      col.push(enriched);
    });
    Object.keys(map).forEach((slug) => {
      map[slug] = sortKanbanCardsByPosition(map[slug]);
    });
    return map;
  }, [cards, cardLabels, analysts, developers, cardImages, sortedColumns, filterLabelIds, filterAnalystIds, filterDevIds, searchQuery, completionColumnSlug]);

  const hasActiveCardFilters =
    filterLabelIds.length > 0 ||
    filterAnalystIds.length > 0 ||
    filterDevIds.length > 0 ||
    searchQuery.trim().length > 0;

  const runPostSaveBackground = useCallback(
    async (opts: {
      cardId: string;
      cardTitle: string;
      imageFiles: File[];
      attachmentFiles: File[];
      developerId: string | null;
      analystId: string | null;
      notify?: { actionType: 'assignee' | 'edit'; message: string };
      logLabel?: string;
    }) => {
      const { cardId, cardTitle, imageFiles, attachmentFiles, developerId, analystId, notify, logLabel } = opts;

      if (imageFiles.length > 0) {
        const { uploaded, failed, images } = await uploadKanbanImagesParallel(
          'dev_kanban_card_images',
          cardId,
          imageFiles,
        );
        if (images.length > 0) {
          patchDevKanbanBoardCardImages(queryClient, (rows) => [...rows, ...images]);
        }
        if (failed > 0) {
          toast.error(
            failed === imageFiles.length
              ? 'Algumas imagens não foram enviadas.'
              : `${failed} imagem(ns) não enviada(s).`,
          );
        } else if (uploaded > 0) {
          toast.success(`${uploaded} imagem(ns) anexada(s).`);
        }
      }

      if (attachmentFiles.length > 0) {
        await uploadAndSaveFiles(cardId, attachmentFiles);
        queryClient.invalidateQueries({ queryKey: ['dev-card-files', cardId] });
      }

      if (logLabel) void logActivity(logLabel, cardTitle);

      if (notify && (developerId || analystId)) {
        try {
          await notifyDevAndAnalyst({
            cardId,
            cardTitle,
            developerId,
            analystId,
            actionType: notify.actionType,
            actorId: user?.id,
            actorName,
            message: notify.message,
          });
        } catch (notifyErr) {
          console.warn('[kanban-dev] notificação:', notifyErr);
        }
      }
    },
    [actorName, queryClient, user?.id],
  );

  const uploadAndSaveFiles = async (cardId: string, files: File[]) => {
    for (const file of files) {
      try {
        await uploadKanbanFileForCard(
          'dev-kanban-files',
          'dev_kanban_card_files',
          cardId,
          file,
          user?.id,
          user?.email || '',
        );
      } catch (e: any) {
        console.error('Erro no upload do arquivo:', e);
        toast.error(`Erro ao enviar ${file.name}: ${e.message}`);
      }
    }
  };

  const createCard = useMutation({
    mutationFn: async () => {
      markBoardLocalWrite(10);
      const imageFiles = [...pendingImages];
      const attachmentFiles = [...pendingFiles];
      const colCards = cardsByColumn[targetColumn] || [];
      const position = colCards.length;
      const { data, error } = await supabase.from('dev_kanban_cards').insert({
        title,
        description: description || null,
        status: targetColumn,
        position,
        analyst_id: analystId || null,
        developer_id: developerId || null,
        image_url: null,
        created_by: user!.id,
      }).select().single();
      if (error) throw error;
      await saveDevKanbanDevNotes(
        data.id,
        devNotes.trim() || null,
        user!.id,
        user!.email || '',
      );
      data.dev_notes = devNotes.trim() || null;
      await syncCardLabels('dev_kanban_card_labels', data.id, selectedLabels);
      return {
        card: data,
        imageFiles,
        attachmentFiles,
        notify:
          developerId || analystId
            ? {
                actionType: 'assignee' as const,
                message: `${actorName} criou o ticket ${devTicketLabel(data.ticket_number, title)}`,
              }
            : undefined,
        logLabel: 'Criou card no Kanban DEV',
      };
    },
    onSuccess: (result) => {
      const newCard = result?.card;
      if (newCard) {
        markBoardLocalWrite(4);
        patchDevKanbanBoardCards(queryClient, (list) => [...list, newCard]);
        patchDevKanbanBoardCardLabels(queryClient, (rows) => {
          const rest = rows.filter((r: any) => r.card_id !== newCard.id);
          const next = selectedLabels.map((label_id) => {
            const label = labels.find((l: any) => l.id === label_id);
            return {
              card_id: newCard.id,
              label_id,
              dev_kanban_labels: label ?? { id: label_id },
            };
          });
          return [...rest, ...next];
        });
      }
      resetForm();
      setCreateOpen(false);
      toast.success('Card criado!');
      if (result?.card) {
        void runPostSaveBackground({
          cardId: result.card.id,
          cardTitle: title,
          imageFiles: result.imageFiles,
          attachmentFiles: result.attachmentFiles,
          developerId: developerId || null,
          analystId: analystId || null,
          notify: result.notify,
          logLabel: result.logLabel,
        });
      }
    },
    onError: (e: Error) => toast.error(e?.message ? `Erro ao criar card: ${e.message}` : 'Erro ao criar card.'),
  });

  const updateCard = useMutation({
    mutationFn: async () => {
      markBoardLocalWrite(10);
      if (!editingCard) return;
      const imageFiles = [...pendingImages];
      const attachmentFiles = [...pendingFiles];
      const prevDevId = editingCard.developer_id || null;
      const newDevId = developerId || null;
      const titleChanged = editingCard.title !== title;
      const descChanged = (editingCard.description || '') !== (description || '');
      const devNotesChanged = initialDevNotesRef.current !== (devNotes.trim() || '');
      const analystChanged = (editingCard.analyst_id || null) !== (analystId || null);
      const devChanged = prevDevId !== newDevId;
      const statusChanged =
        !!moveToColumnSlug && moveToColumnSlug !== editingCard.status;
      const wasDone = isDoneSlug(editingCard.status);
      const willBeDone = statusChanged && isDoneSlug(moveToColumnSlug);

      let newPosition = editingCard.position ?? 0;
      if (statusChanged) {
        const destCards = cards.filter(
          (c: any) => c.status === moveToColumnSlug && c.id !== editingCard.id,
        );
        newPosition =
          destCards.length > 0
            ? Math.max(...destCards.map((c: any) => c.position ?? 0)) + 1
            : 0;
      }

      const updatePayload: Record<string, unknown> = {
        title,
        description: description || null,
        analyst_id: analystId || null,
        developer_id: newDevId,
      };
      if (statusChanged) {
        updatePayload.status = moveToColumnSlug;
        updatePayload.position = newPosition;
        if (willBeDone) updatePayload.completed_at = new Date().toISOString();
        else if (wasDone && !willBeDone) updatePayload.completed_at = null;
      }

      let { error } = await supabase
        .from('dev_kanban_cards')
        .update(updatePayload)
        .eq('id', editingCard.id);

      if (error && statusChanged && `${error.message}`.toLowerCase().includes('completed_at')) {
        const retryPayload = { ...updatePayload };
        delete retryPayload.completed_at;
        const retry = await supabase
          .from('dev_kanban_cards')
          .update(retryPayload)
          .eq('id', editingCard.id);
        error = retry.error;
      }
      if (error) throw error;

      if (statusChanged) {
        await withSupabaseRetry(() =>
          applyDoneLabelRule(editingCard.id, editingCard.status, moveToColumnSlug),
        );
      }
      await saveDevKanbanDevNotes(
        editingCard.id,
        devNotes.trim() || null,
        user!.id,
        user!.email || '',
      );
      await syncCardLabels('dev_kanban_card_labels', editingCard.id, selectedLabels);

      let notify: { actionType: 'assignee' | 'edit'; message: string } | undefined;
      if (devChanged) {
        notify = {
          actionType: 'assignee',
          message: `${actorName} alterou o responsável do ticket ${devTicketLabel(editingCard.ticket_number, title)}`,
        };
      } else if (titleChanged || descChanged || devNotesChanged || analystChanged) {
        notify = {
          actionType: 'edit',
          message: `${actorName} editou o ticket ${devTicketLabel(editingCard.ticket_number, title)}`,
        };
      }

      return {
        cardId: editingCard.id,
        imageFiles,
        attachmentFiles,
        notify,
        logLabel: 'Editou card no Kanban DEV',
        statusMove: statusChanged
          ? {
              fromSlug: editingCard.status,
              toSlug: moveToColumnSlug,
              newPosition,
              wasDone,
              willBeDone: !!willBeDone,
            }
          : undefined,
      };
    },
    onSuccess: (result) => {
      const cardId = result?.cardId ?? editingCard?.id;
      if (!cardId) return;
      markBoardLocalWrite(4);
      patchDevKanbanBoardCards(queryClient, (list) =>
        list.map((c: any) => {
          if (c.id !== cardId) return c;
          const next: any = {
            ...c,
            title,
            description: description || null,
            dev_notes: devNotes.trim() || null,
            analyst_id: analystId || null,
            developer_id: developerId || null,
          };
          if (result?.statusMove) {
            const { toSlug, newPosition, wasDone, willBeDone } = result.statusMove;
            next.status = toSlug;
            next.position = newPosition;
            if (willBeDone) next.completed_at = new Date().toISOString();
            else if (wasDone && !willBeDone) next.completed_at = null;
          }
          return next;
        }),
      );
      patchDevKanbanBoardCardLabels(queryClient, (rows) => {
        const rest = rows.filter((r: any) => r.card_id !== cardId);
        const next = selectedLabels.map((label_id) => {
          const label = labels.find((l: any) => l.id === label_id);
          return {
            card_id: cardId,
            label_id,
            dev_kanban_labels: label ?? { id: label_id },
          };
        });
        return [...rest, ...next];
      });
      resetForm();
      setEditOpen(false);
      toast.success('Card atualizado!');
      if (result) {
        void runPostSaveBackground({
          cardId,
          cardTitle: title,
          imageFiles: result.imageFiles,
          attachmentFiles: result.attachmentFiles,
          developerId: developerId || null,
          analystId: analystId || null,
          notify: result.notify,
          logLabel: result.logLabel,
        });
        if (result.statusMove && editingCard) {
          const { fromSlug, toSlug } = result.statusMove;
          const colTitle =
            sortedColumns.find((c: any) => c.slug === toSlug)?.title || toSlug;
          const isMoveToDone = !isDoneSlug(fromSlug) && isDoneSlug(toSlug);
          void notifyDevAndAnalyst({
            cardId,
            cardTitle: title,
            developerId: developerId || editingCard.developer_id || null,
            analystId: analystId || editingCard.analyst_id || null,
            actionType: 'status',
            actorId: user?.id,
            actorName,
            message: isMoveToDone
              ? `${actorName} concluiu o ticket ${devTicketLabel(editingCard.ticket_number, title)} em ${new Date().toLocaleString('pt-BR')}`
              : `${actorName} moveu ${devTicketLabel(editingCard.ticket_number, title)} para "${colTitle}"`,
          });
        }
      }
    },
    onError: (e: Error) => toast.error(e?.message ? `Erro ao atualizar card: ${e.message}` : 'Erro ao atualizar card.'),
  });

  const deleteCard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dev_kanban_cards').delete().eq('id', id);
      if (error) throw error;
      await logActivity('Excluiu card do Kanban DEV');
    },
    onSuccess: () => {
      refreshDevKanbanBoard(queryClient);
      toast.success('Card excluído!');
    },
  });

  const deleteImage = useMutation({
    mutationFn: async (imageId: string) => {
      const { error } = await supabase.from('dev_kanban_card_images').delete().eq('id', imageId);
      if (error) throw error;
      return imageId;
    },
    onSuccess: (imageId) => {
      markBoardLocalWrite(2);
      patchDevKanbanBoardCardImages(queryClient, (rows) =>
        rows.filter((img: any) => img.id !== imageId),
      );
      toast.success('Imagem removida!');
    },
  });

  const createLabel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('dev_kanban_labels').insert({ name: newLabelName, color: newLabelColor });
      if (error) throw error;
    },
    onSuccess: () => {
      refreshDevKanbanBoard(queryClient);
      setNewLabelName(''); setNewLabelColor('#3b82f6');
      toast.success('Etiqueta criada!');
    },
  });

  const updateLabel = useMutation({
    mutationFn: async () => {
      if (!editingLabel) return;
      const { error } = await supabase.from('dev_kanban_labels')
        .update({ name: editLabelName, color: editLabelColor })
        .eq('id', editingLabel.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshDevKanbanBoard(queryClient);
      setEditingLabel(null);
      toast.success('Etiqueta atualizada!');
    },
  });

  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('dev_kanban_card_labels').delete().eq('label_id', id);
      const { error } = await supabase.from('dev_kanban_labels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshDevKanbanBoard(queryClient);
      setDeleteLabelId(null);
      toast.success('Etiqueta excluída!');
    },
  });

  const addColumn = useMutation({
    mutationFn: async () => {
      const slug = newColumnTitle.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();
      const position = sortedColumns.length;
      const { error } = await supabase.from('dev_kanban_columns').insert({
        title: newColumnTitle, slug, position, color: newColumnColor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refreshDevKanbanBoard(queryClient);
      setNewColumnTitle(''); setNewColumnColor('border-t-blue-500');
      setAddColumnOpen(false);
      toast.success('Lista criada!');
    },
    onError: () => toast.error('Erro ao criar lista.'),
  });

  const editColumn = useMutation({
    mutationFn: async () => {
      if (!editingColumn) return;
      const { error } = await supabase.from('dev_kanban_columns')
        .update({ title: editColumnTitle, color: editColumnColor })
        .eq('id', editingColumn.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshDevKanbanBoard(queryClient);
      setEditColumnOpen(false); setEditingColumn(null);
      toast.success('Lista atualizada!');
    },
  });

  const removeColumn = useMutation({
    mutationFn: async (id: string) => {
      const col = sortedColumns.find((c: any) => c.id === id);
      if (!col) return;
      const firstCol = sortedColumns.find((c: any) => c.id !== id);
      if (firstCol) {
        await supabase.from('dev_kanban_cards').update({ status: firstCol.slug }).eq('status', col.slug);
      }
      const { error } = await supabase.from('dev_kanban_columns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshDevKanbanBoard(queryClient);
      setDeleteColumnId(null);
      toast.success('Lista excluída!');
    },
  });

  const getCardCompletedAt = useCallback((card: any): string | null => {
    if (!card || !isKanbanCompletionSlug(card.status, completionColumnSlug)) return null;
    return card.completed_at || null;
  }, [completionColumnSlug]);

  // Helper: garante existência da etiqueta "Concluído" e retorna seu id
  const ensureDoneLabel = useCallback(async (): Promise<string | null> => {
    const existing = (labels as any[]).find((l: any) => (l.name || '').toLowerCase().includes('conclu'));
    if (existing) return existing.id;
    const { data, error } = await supabase.from('dev_kanban_labels')
      .insert({ name: 'Concluído', color: '#10b981' })
      .select().single();
    if (error || !data) {
      const fallback = await supabase
        .from('dev_kanban_labels')
        .select('id,name')
        .ilike('name', '%conclu%')
        .limit(1)
        .maybeSingle();
      if (fallback.data?.id) return fallback.data.id;
      console.error("Erro ao criar etiqueta Concluído:", error);
      toast.error("Erro ao criar etiqueta 'Concluído' automaticamente.");
      return null;
    }
    refreshDevKanbanBoard(queryClient);
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
      await syncCardLabels('dev_kanban_card_labels', cardId, [doneLabelId]);
      patchDevKanbanBoardCardLabels(queryClient, (old) => {
        const targetLabel = (labels as any[]).find((l) => l.id === doneLabelId);
        return [
          ...old.filter((cl: any) => cl.card_id !== cardId),
          { card_id: cardId, label_id: doneLabelId, dev_kanban_labels: targetLabel },
        ];
      });
    } else if (movedFromDone) {
      const doneLabelId = await ensureDoneLabel();
      if (!doneLabelId) return;
      const remaining = uniqueLabelIds(
        cardLabels
          .filter((cl: any) => cl.card_id === cardId && cl.label_id !== doneLabelId)
          .map((cl: any) => cl.label_id),
      );
      await syncCardLabels('dev_kanban_card_labels', cardId, remaining);
      patchDevKanbanBoardCardLabels(queryClient, (old) =>
        old.filter((cl: any) => !(cl.card_id === cardId && cl.label_id === doneLabelId)),
      );
    }
  }, [ensureDoneLabel, queryClient, labels, cardLabels, isDoneSlug]);

  const onDragEnd = useCallback((result: DropResult) => {
    if (!result.destination || dragBusyRef.current || hasActiveCardFilters) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const boardCards =
      (queryClient.getQueryData<{ cards?: any[] }>(DEV_KANBAN_BOARD_QUERY_KEY)?.cards as any[]) ??
      cards;

    const positionUpdates = computeKanbanDragPositionUpdates(
      boardCards,
      draggableId,
      source.droppableId,
      destination.droppableId,
      source.index,
      destination.index,
    );
    if (positionUpdates.length === 0) return;

    const movedCard = boardCards.find((c: any) => c.id === draggableId);
    const statusChanged = source.droppableId !== destination.droppableId;
    const wasDone = isDoneSlug(source.droppableId);
    const willBeDone = isDoneSlug(destination.droppableId);
    const previousCards = boardCards;

    dragBusyRef.current = true;
    markBoardLocalWrite(statusChanged ? 2 : 1);

    const completedAtOnMove =
      statusChanged && willBeDone
        ? new Date().toISOString()
        : statusChanged && wasDone && !willBeDone
          ? null
          : undefined;

    const updateById = new Map(positionUpdates.map((u) => [u.id, u]));

    patchDevKanbanBoardCards(queryClient, (old) =>
      old.map((card: any) => {
        const next = updateById.get(card.id);
        if (!next) return card;
        return {
          ...card,
          status: next.status,
          position: next.position,
          completed_at:
            card.id === draggableId && completedAtOnMove !== undefined
              ? completedAtOnMove
              : card.completed_at,
        };
      }),
    );

    dragBusyRef.current = false;

    void (async () => {
      try {
        await withSupabaseRetry(() =>
          Promise.all([
            persistDevKanbanCardPositions(boardCards, positionUpdates, {
              draggableId,
              completedAtOnMove,
            }),
            statusChanged
              ? applyDoneLabelRule(draggableId, source.droppableId, destination.droppableId)
              : Promise.resolve(),
          ]),
        );
      } catch (error: unknown) {
        if (previousCards) {
          patchDevKanbanBoardCards(queryClient, () => previousCards);
        } else {
          flushDevKanbanBoardRefresh(queryClient);
        }
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        toast.error(
          isSupabaseLockError(error)
            ? 'Sistema ocupado — solte o card e tente mover de novo em instantes.'
            : `Erro ao mover card: ${message}`,
        );
        return;
      }

      if (statusChanged && movedCard) {
        const colTitle =
          sortedColumns.find((c: any) => c.slug === destination.droppableId)?.title ||
          destination.droppableId;
        const isMoveToDone = !isDoneSlug(source.droppableId) && isDoneSlug(destination.droppableId);
        void notifyDevAndAnalyst({
          cardId: movedCard.id,
          cardTitle: movedCard.title,
          developerId: movedCard.developer_id || null,
          analystId: movedCard.analyst_id || null,
          actionType: 'status',
          actorId: user?.id,
          actorName,
          message: isMoveToDone
            ? `${actorName} concluiu o ticket ${devTicketLabel(movedCard.ticket_number, movedCard.title)} em ${new Date().toLocaleString('pt-BR')}`
            : `${actorName} moveu ${devTicketLabel(movedCard.ticket_number, movedCard.title)} para "${colTitle}"`,
        });
      }
    })();
  }, [queryClient, cards, sortedColumns, user, actorName, applyDoneLabelRule, isDoneSlug, hasActiveCardFilters]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDevNotes('');
    setAnalystId('');
    setDeveloperId('');
    setSelectedLabels([]);
    setPendingImages([]);
    setPendingFiles([]);
    setEditingCard(null);
    setMoveToColumnSlug('');
  };

  const editFormDirty = useMemo(
    () =>
      isDevKanbanCardFormDirty(editingCard, {
        title,
        description,
        devNotes,
        initialDevNotes: initialDevNotesRef.current,
        analystId,
        developerId,
        selectedLabels,
        moveToColumnSlug,
      }) || pendingImages.length > 0 || pendingFiles.length > 0,
    [
      editingCard,
      title,
      description,
      devNotes,
      analystId,
      developerId,
      selectedLabels,
      moveToColumnSlug,
      pendingImages.length,
      pendingFiles.length,
    ],
  );

  const handleEditOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setEditOpen(true);
        return;
      }
      if (editingCard && editFormDirty && title.trim()) {
        if (!updateCard.isPending) {
          updateCard.mutate();
        }
        return;
      }
      resetForm();
      setEditOpen(false);
    },
    [editingCard, editFormDirty, title, updateCard],
  );

  const openEdit = (card: any) => {
    setEditingCard(card);
    setMoveToColumnSlug(card.status || '');
    setTitle(card.title);
    setDescription(card.description || '');
    setDevNotes((card.dev_notes || '').trim());
    initialDevNotesRef.current = (card.dev_notes || '').trim();
    setAnalystId(card.analyst_id || '');
    setDeveloperId(card.developer_id || '');
    setSelectedLabels(uniqueLabelIds((card.labels || []).map((l: any) => l?.id).filter(Boolean)));
    setPendingImages([]);
    setPendingFiles([]);
    setEditOpen(true);
    void loadDevKanbanDevNotes(card.id, card.dev_notes).then((notes) => {
      setDevNotes(notes);
      initialDevNotesRef.current = notes;
    }).catch(() => {
      toast.error('Não foi possível carregar as observações DEV.');
    });
  };

  const openView = (card: any) => {
    setViewingCard(card);
    setViewingDevNotes('');
    setViewOpen(true);
    void loadDevKanbanDevNotes(card.id, card.dev_notes).then(setViewingDevNotes).catch(() => {});
  };
  const openCreate = (colSlug: string) => { resetForm(); setTargetColumn(colSlug); setCreateOpen(true); };

  const toggleLabel = useCallback((labelId: string) => {
    setSelectedLabels((prev) => {
      if (prev.includes(labelId)) return prev.filter((id) => id !== labelId);
      return uniqueLabelIds([...prev, labelId]);
    });
  }, []);

  const startEditLabel = (label: any) => { setEditingLabel(label); setEditLabelName(label.name); setEditLabelColor(label.color); };

  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
  };

  const openEditColumn = (col: any) => {
    setEditingColumn(col); setEditColumnTitle(col.title); setEditColumnColor(col.color); setEditColumnOpen(true);
  };

  const viewingCardImages = useMemo(() => {
    if (!viewingCard) return [];
    return cardImages.filter((img: any) => img.card_id === viewingCard.id);
  }, [viewingCard, cardImages]);

  const editingCardImages = useMemo(() => {
    if (!editingCard) return [];
    return cardImages.filter((img: any) => img.card_id === editingCard.id);
  }, [editingCard, cardImages]);

  // Auto-open a card when navigated with ?card=<id> (e.g., from notifications)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const cardParam = searchParams.get('card');
    if (!cardParam || cards.length === 0) return;
    const target = cards.find((c: any) => c.id === cardParam);
    if (target) {
      setViewingCard(target);
      setViewingDevNotes('');
      setViewOpen(true);
      void loadDevKanbanDevNotes(target.id, target.dev_notes).then(setViewingDevNotes).catch(() => {});
      // Clean up URL so re-opening doesn't reopen the same card
      const next = new URLSearchParams(searchParams);
      next.delete('card');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, cards, setSearchParams]);

  const moveColumn = useCallback(async (colId: string, direction: 'left' | 'right') => {
    const idx = sortedColumns.findIndex((c: any) => c.id === colId);
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedColumns.length) return;
    const a = sortedColumns[idx];
    const b = sortedColumns[swapIdx];
    patchDevKanbanBoardColumns(queryClient, (old) =>
      old.map((c: any) =>
        c.id === a.id ? { ...c, position: b.position } : c.id === b.id ? { ...c, position: a.position } : c,
      ),
    );
    await Promise.all([
      supabase.from('dev_kanban_columns').update({ position: b.position }).eq('id', a.id),
      supabase.from('dev_kanban_columns').update({ position: a.position }).eq('id', b.id),
    ]);
    refreshDevKanbanBoard(queryClient);
  }, [sortedColumns, queryClient]);

  const toggleFilterLabel = useCallback((labelId: string) => {
    setFilterLabelIds(prev => prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]);
  }, []);
  const toggleFilterAnalyst = useCallback((aId: string) => {
    setFilterAnalystIds(prev => prev.includes(aId) ? prev.filter(id => id !== aId) : [...prev, aId]);
  }, []);
  const toggleFilterDev = useCallback((dId: string) => {
    setFilterDevIds(prev => prev.includes(dId) ? prev.filter(id => id !== dId) : [...prev, dId]);
  }, []);

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] max-h-[calc(100dvh-5.5rem)] min-h-0 flex-col gap-3 overflow-hidden animate-fade-in md:h-[calc(100dvh-6.5rem)] md:max-h-[calc(100dvh-6.5rem)]">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Kanban DEV</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setLabelOpen(true)}>
            <Tag className="h-4 w-4 mr-1" /> Etiquetas
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddColumnOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar lista
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nº do ticket, cliente ou título..."
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
                <Filter className="h-3.5 w-3.5 mr-1" /> Etiquetas
                {filterLabelIds.length > 0 && <Badge variant="default" className="ml-1.5 h-5 px-1.5 text-[10px]">{filterLabelIds.length}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="flex flex-col gap-1">
                {labels.map((l: any) => (
                  <button key={l.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors text-left ${filterLabelIds.includes(l.id) ? 'bg-accent font-medium' : ''}`} onClick={() => toggleFilterLabel(l.id)}>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </button>
                ))}
                {filterLabelIds.length > 0 && <Button variant="ghost" size="sm" className="text-xs h-7 mt-1" onClick={() => setFilterLabelIds([])}><X className="h-3 w-3 mr-1" /> Limpar</Button>}
              </div>
            </PopoverContent>
          </Popover>
        )}
        {analysts.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-8">
                <Filter className="h-3.5 w-3.5 mr-1" /> Analista
                {filterAnalystIds.length > 0 && <Badge variant="default" className="ml-1.5 h-5 px-1.5 text-[10px]">{filterAnalystIds.length}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="flex flex-col gap-1">
                {analysts.map((a: any) => (
                  <button key={a.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors text-left ${filterAnalystIds.includes(a.id) ? 'bg-accent font-medium' : ''}`} onClick={() => toggleFilterAnalyst(a.id)}>
                    {a.name}
                  </button>
                ))}
                {filterAnalystIds.length > 0 && <Button variant="ghost" size="sm" className="text-xs h-7 mt-1" onClick={() => setFilterAnalystIds([])}><X className="h-3 w-3 mr-1" /> Limpar</Button>}
              </div>
            </PopoverContent>
          </Popover>
        )}
        {developers.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-8">
                <Filter className="h-3.5 w-3.5 mr-1" /> Desenvolvedor
                {filterDevIds.length > 0 && <Badge variant="default" className="ml-1.5 h-5 px-1.5 text-[10px]">{filterDevIds.length}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="flex flex-col gap-1">
                {developers.map((d: any) => (
                  <button key={d.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors text-left ${filterDevIds.includes(d.id) ? 'bg-accent font-medium' : ''}`} onClick={() => toggleFilterDev(d.id)}>
                    {d.name}
                  </button>
                ))}
                {filterDevIds.length > 0 && <Button variant="ghost" size="sm" className="text-xs h-7 mt-1" onClick={() => setFilterDevIds([])}><X className="h-3 w-3 mr-1" /> Limpar</Button>}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {isLoading ? (
        <div className="min-h-0 flex-1 overflow-hidden px-2">
          <KanbanSkeleton columns={Math.max(sortedColumns.length, 4)} />
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div
            className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden sm:gap-4 [scrollbar-gutter:stable]"
            role="region"
            aria-label="Listas do Kanban"
          >
            {sortedColumns.map((col: any, colIdx: number) => (
              <div
                key={col.id}
                className={`flex h-full min-h-0 w-[min(92vw,300px)] shrink-0 flex-col rounded-lg border-t-4 bg-muted/30 p-3 sm:w-72 ${col.color}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">{col.title}</h3>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="text-xs">{(cardsByColumn[col.slug] || []).length}</Badge>
                    {isAdmin && colIdx > 0 && (
                      <button onClick={() => moveColumn(col.id, 'left')} className="text-muted-foreground hover:text-primary"><ArrowLeft className="h-3 w-3" /></button>
                    )}
                    {isAdmin && colIdx < sortedColumns.length - 1 && (
                      <button onClick={() => moveColumn(col.id, 'right')} className="text-muted-foreground hover:text-primary"><ArrowRight className="h-3 w-3" /></button>
                    )}
                    <button onClick={() => openEditColumn(col)} className="text-muted-foreground hover:text-primary"><Pencil className="h-3 w-3" /></button>
                    {sortedColumns.length > 1 && (
                      <button onClick={() => setDeleteColumnId(col.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                    )}
                  </div>
                </div>
                <Droppable droppableId={col.slug}>
                  {(provided, dropSnapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[120px] flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1 transition-colors ${dropSnapshot.isDraggingOver ? 'rounded-md bg-muted/40' : ''}`}
                    >
                      {(cardsByColumn[col.slug] || []).map((card: any, index: number) => (
                        <Draggable
                          key={card.id}
                          draggableId={card.id}
                          index={index}
                          isDragDisabled={hasActiveCardFilters}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              onClick={() => { if (!snapshot.isDragging) openView(card); }}
                              className={`bg-card rounded-md border p-3 shadow-sm space-y-2 cursor-pointer hover:shadow-md transition-shadow break-words ${snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''}`}
                              style={{ wordWrap: 'break-word', overflowWrap: 'anywhere', ...provided.draggableProps.style }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-1">
                                  <button
                                    type="button"
                                    {...provided.dragHandleProps}
                                    disabled={hasActiveCardFilters}
                                    className={`shrink-0 touch-none ${hasActiveCardFilters ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground'}`}
                                    title={hasActiveCardFilters ? 'Limpe os filtros para reorganizar os cards' : 'Arrastar para reordenar'}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <GripVertical className="h-3 w-3" />
                                  </button>
                                  <DevTicketNumberBadge ticketNumber={card.ticket_number} />
                                </div>
                                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => openEdit(card)} className="text-muted-foreground hover:text-primary"><Pencil className="h-3 w-3" /></button>
                                  <button onClick={() => deleteCard.mutate(card.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                                </div>
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-sm flex-1 flex items-start gap-1 break-words" style={{ overflowWrap: 'anywhere' }}>
                                  {isDoneSlug(card.status) && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />}
                                  <span className="break-words">{card.title}</span>
                                </p>
                              </div>
                              {card.description && <p className="text-xs text-muted-foreground line-clamp-2 break-words" style={{ overflowWrap: 'anywhere' }}>{card.description}</p>}
                              <div className="flex items-center gap-2 flex-wrap">
                                {card.labels?.length > 0 && card.labels.map((l: any) => (
                                  <span key={l.id} className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: l.color }}>{l.name}</span>
                                ))}
                                {card.images?.length > 0 && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><Paperclip className="h-3 w-3" /> {card.images.length}</span>
                                )}
                                <ChecklistBadge cardId={card.id} progressMap={checklistProgress} />
                              </div>
                              <div className="flex items-center justify-between gap-1 flex-wrap">
                                {card.analyst && (
                                  <div className="flex items-center gap-1">
                                    <ProfileAvatar className="h-5 w-5" photoUrl={card.analyst.photo_url} fallbackLabel={card.analyst.name || '?'} />
                                    <span className="text-[10px] text-muted-foreground">{card.analyst.name}</span>
                                  </div>
                                )}
                                {card.developer && (
                                  <div className="flex items-center gap-1">
                                    <ProfileAvatar className="h-5 w-5" photoUrl={card.developer.photo_url} fallbackLabel={card.developer.name || '?'} />
                                    <span className="text-[10px] text-muted-foreground">{card.developer.name}</span>
                                  </div>
                                )}
                                <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title="Data de criação">
                                    <Calendar className="h-3 w-3" />
                                    Criado em {format(new Date(card.created_at), 'dd/MM HH:mm')}
                                  </span>
                                  {getCardCompletedAt(card) && (
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5" title="Data de conclusão">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Concluído em {format(new Date(getCardCompletedAt(card)!), 'dd/MM HH:mm')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
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
        <DialogContent className="max-w-2xl w-[min(42rem,calc(100vw-2rem))] flex min-h-0 flex-col max-h-[min(90vh,calc(100dvh-2rem))] overflow-hidden gap-0 p-0">
          <div className="shrink-0 px-6 pt-6 pb-2 pr-14 min-w-0">
            <DialogHeader>
              <DialogTitle className="break-words pr-2">{viewingCard?.title}</DialogTitle>
              <DialogDescription>{sortedColumns.find((c: any) => c.slug === viewingCard?.status)?.title}</DialogDescription>
            </DialogHeader>
          </div>
          {viewingCard && (
            <>
              <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-y-contain px-6 pb-4 [-webkit-overflow-scrolling:touch]">
                <DevTicketNumberBadge ticketNumber={viewingCard.ticket_number} variant="field" />
                {viewingCard.description && (
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Observações do ticket</p>
                    <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{viewingCard.description}</p>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">
                    Observações / correções (DEV)
                  </p>
                  {viewingDevNotes ? (
                    <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-md border bg-muted/30 p-3">
                      {viewingDevNotes}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic rounded-md border border-dashed p-3">
                      Nenhuma observação registrada.
                    </p>
                  )}
                </div>
                {viewingCardImages.length > 0 && (
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Imagens ({viewingCardImages.length})</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {viewingCardImages.map((img: any, i: number) => (
                        <KanbanCardImage
                          key={img.id}
                          imageUrl={img.image_url}
                          className="rounded-lg w-full h-32 object-cover border cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => openLightbox(viewingCardImages.map((im: any) => im.image_url), i)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {viewingCard.labels?.length > 0 && (
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Etiquetas</p>
                    <div className="flex flex-wrap gap-1">
                      {viewingCard.labels.map((l: any) => (
                        <span key={l.id} className="text-xs px-2 py-1 rounded-full text-white" style={{ backgroundColor: l.color }}>{l.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-4 flex-wrap min-w-0">
                  {viewingCard.analyst && (
                    <div className="flex items-center gap-2 min-w-0">
                      <ProfileAvatar className="h-7 w-7 shrink-0" photoUrl={viewingCard.analyst.photo_url} fallbackLabel={viewingCard.analyst.name || '?'} />
                      <span className="text-sm text-muted-foreground break-words">Analista: {viewingCard.analyst.name}</span>
                    </div>
                  )}
                  {viewingCard.developer && (
                    <div className="flex items-center gap-2 min-w-0">
                      <ProfileAvatar className="h-7 w-7 shrink-0" photoUrl={viewingCard.developer.photo_url} fallbackLabel={viewingCard.developer.name || '?'} />
                      <span className="text-sm text-muted-foreground break-words">Dev: {viewingCard.developer.name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>Criado em: {format(new Date(viewingCard.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                  {getCardCompletedAt(viewingCard) && (
                    <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>Concluído em: {format(new Date(getCardCompletedAt(viewingCard)!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                    </div>
                  )}
                </div>
                <CardChecklist cardId={viewingCard.id} cardType="dev" description={viewingCard.description} />
                <DevCardFiles cardId={viewingCard.id} />
                <DevCardComments cardId={viewingCard.id} />
              </div>
              <div className="shrink-0 flex gap-2 border-t bg-background px-6 py-3">
                <Button size="sm" variant="outline" onClick={() => { setViewOpen(false); openEdit(viewingCard); }}>
                  <Pencil className="h-3 w-3 mr-1" /> Editar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          className="max-w-md flex min-h-0 flex-col max-h-[min(90vh,calc(100dvh-2rem))] overflow-hidden gap-0 p-0"
          onPointerDownOutside={e => e.preventDefault()}
        >
          <div className="shrink-0 px-6 pt-6 pb-2 pr-14">
            <DialogHeader>
              <DialogTitle>Novo Card</DialogTitle>
              <DialogDescription>Preencha os dados do card.</DialogDescription>
            </DialogHeader>
          </div>
          <DevCardFormContent
            title={title} setTitle={setTitle}
            description={description} setDescription={setDescription}
            devNotes={devNotes} setDevNotes={setDevNotes}
            analystId={analystId} setAnalystId={setAnalystId}
            developerId={developerId} setDeveloperId={setDeveloperId}
            analysts={analysts} developers={developers} labels={labels}
            selectedLabels={selectedLabels} toggleLabel={toggleLabel}
            pendingImages={pendingImages} setPendingImages={setPendingImages}
            pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
            existingImages={[]} onDeleteImage={() => {}}
            onSubmit={() => createCard.mutate()} loading={createCard.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent
          className="max-w-2xl w-[min(42rem,calc(100vw-2rem))] flex min-h-0 flex-col max-h-[min(90vh,calc(100dvh-2rem))] overflow-hidden gap-0 p-0"
          onPointerDownOutside={e => e.preventDefault()}
        >
          <div className="shrink-0 px-6 pt-6 pb-2 pr-14 min-w-0">
            <DialogHeader>
              <DialogTitle className="break-words pr-2">Editar Card</DialogTitle>
              <DialogDescription>Altere os dados do card.</DialogDescription>
            </DialogHeader>
            {editingCard?.ticket_number != null && (
              <DevTicketNumberBadge
                ticketNumber={editingCard.ticket_number}
                variant="field"
                className="mx-6 mb-2"
              />
            )}
          </div>
          <DevCardFormContent
            title={title} setTitle={setTitle}
            description={description} setDescription={setDescription}
            devNotes={devNotes} setDevNotes={setDevNotes}
            analystId={analystId} setAnalystId={setAnalystId}
            developerId={developerId} setDeveloperId={setDeveloperId}
            analysts={analysts} developers={developers} labels={labels}
            selectedLabels={selectedLabels} toggleLabel={toggleLabel}
            pendingImages={pendingImages} setPendingImages={setPendingImages}
            pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
            existingImages={editingCardImages} onDeleteImage={(id) => deleteImage.mutate(id)}
            columns={sortedColumns}
            moveToColumn={moveToColumnSlug}
            setMoveToColumn={setMoveToColumnSlug}
            showMoveTo
            onSubmit={() => updateCard.mutate()} loading={updateCard.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Label Manager */}
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
              <Button size="sm" onClick={() => createLabel.mutate()} disabled={!newLabelName.trim()}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {labels.map((l: any) => (
                <div key={l.id}>
                  {editingLabel?.id === l.id ? (
                    <div className="flex items-center gap-2 py-1">
                      <Input value={editLabelName} onChange={e => setEditLabelName(e.target.value)} className="flex-1 h-8 text-sm" />
                      <input type="color" value={editLabelColor} onChange={e => setEditLabelColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => updateLabel.mutate()} disabled={!editLabelName.trim()}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingLabel(null)}><X className="h-3 w-3" /></Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-1">
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                      <span className="text-sm flex-1">{l.name}</span>
                      <button onClick={() => startEditLabel(l)} className="text-muted-foreground hover:text-primary"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => setDeleteLabelId(l.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
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
          <AlertDialogHeader><AlertDialogTitle>Excluir etiqueta?</AlertDialogTitle><AlertDialogDescription>Essa ação removerá a etiqueta de todos os cards vinculados.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteLabelId && deleteLabel.mutate(deleteLabelId)}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Column */}
      <Dialog open={addColumnOpen} onOpenChange={setAddColumnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova Lista</DialogTitle><DialogDescription>Crie uma nova coluna no Kanban DEV.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome da lista" value={newColumnTitle} onChange={e => setNewColumnTitle(e.target.value)} />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Cor da borda:</p>
              <div className="flex flex-wrap gap-2">
                {COLUMN_COLOR_OPTIONS.map(c => (
                  <button key={c} onClick={() => setNewColumnColor(c)} className={`w-8 h-8 rounded-full border-2 border-t-4 ${c} ${newColumnColor === c ? 'ring-2 ring-primary ring-offset-2' : 'border-muted'}`} />
                ))}
              </div>
            </div>
            <Button onClick={() => addColumn.mutate()} disabled={!newColumnTitle.trim() || addColumn.isPending} className="w-full">
              {addColumn.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar Lista
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Column */}
      <Dialog open={editColumnOpen} onOpenChange={setEditColumnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar Lista</DialogTitle><DialogDescription>Altere o nome ou cor da lista.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome da lista" value={editColumnTitle} onChange={e => setEditColumnTitle(e.target.value)} />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Cor da borda:</p>
              <div className="flex flex-wrap gap-2">
                {COLUMN_COLOR_OPTIONS.map(c => (
                  <button key={c} onClick={() => setEditColumnColor(c)} className={`w-8 h-8 rounded-full border-2 border-t-4 ${c} ${editColumnColor === c ? 'ring-2 ring-primary ring-offset-2' : 'border-muted'}`} />
                ))}
              </div>
            </div>
            <Button onClick={() => editColumn.mutate()} disabled={!editColumnTitle.trim() || editColumn.isPending} className="w-full">
              {editColumn.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Column */}
      <AlertDialog open={!!deleteColumnId} onOpenChange={() => setDeleteColumnId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir lista?</AlertDialogTitle><AlertDialogDescription>Os cards desta lista serão movidos para a primeira coluna.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteColumnId && removeColumn.mutate(deleteColumnId)}>Excluir</AlertDialogAction></AlertDialogFooter>
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

/* Card Form for DEV Kanban */
function DevCardFormContent({
  title, setTitle, description, setDescription,
  devNotes, setDevNotes,
  analystId, setAnalystId, developerId, setDeveloperId,
  analysts, developers, labels,
  selectedLabels, toggleLabel,
  pendingImages, setPendingImages,
  pendingFiles, setPendingFiles,
  existingImages, onDeleteImage,
  columns, moveToColumn, setMoveToColumn, showMoveTo,
  onSubmit, loading,
}: {
  title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  devNotes: string; setDevNotes: (v: string) => void;
  analystId: string; setAnalystId: (v: string) => void;
  developerId: string; setDeveloperId: (v: string) => void;
  analysts: any[]; developers: any[]; labels: any[];
  selectedLabels: string[]; toggleLabel: (id: string) => void;
  pendingImages: File[]; setPendingImages: (f: File[]) => void;
  pendingFiles: File[]; setPendingFiles: (f: File[]) => void;
  existingImages: any[]; onDeleteImage: (id: string) => void;
  columns?: { slug: string; title: string }[];
  moveToColumn?: string;
  setMoveToColumn?: (v: string) => void;
  showMoveTo?: boolean;
  onSubmit: () => void; loading: boolean;
}) {
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const newFiles = filesFromClipboardData(e.clipboardData);
    if (newFiles.length > 0) {
      e.preventDefault();
      setPendingImages([...pendingImages, ...newFiles]);
      toast.success(`${newFiles.length} imagem(ns) colada(s)!`);
    }
  }, [pendingImages, setPendingImages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setPendingImages([...pendingImages, ...files]);
    e.target.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setPendingFiles([...pendingFiles, ...files]);
    e.target.value = '';
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) setPendingFiles([...pendingFiles, ...files]);
  };

  const removePending = (index: number) => {
    setPendingImages(pendingImages.filter((_, i) => i !== index));
  };
  const removePendingFile = (index: number) => {
    setPendingFiles(pendingFiles.filter((_, i) => i !== index));
  };

  const formatSize = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onPaste={handlePaste}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-y-contain px-6 pb-28 pt-4 [-webkit-overflow-scrolling:touch]">
      <Input
        placeholder="Título"
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoComplete="off"
        className="focus-visible:ring-offset-0"
      />
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Observações do ticket</p>
        <Textarea
          placeholder="Contexto do suporte / analista (use CTRL+V para colar imagens)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          onPaste={handlePaste}
          rows={5}
          className="min-h-[100px] max-h-[min(30vh,240px)] resize-y overflow-y-auto focus-visible:ring-offset-0"
        />
      </div>
      <Select value={analystId} onValueChange={setAnalystId}>
        <SelectTrigger><SelectValue placeholder="Analista responsável" /></SelectTrigger>
        <SelectContent>
          {analysts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={developerId} onValueChange={setDeveloperId}>
        <SelectTrigger><SelectValue placeholder="Desenvolvedor responsável" /></SelectTrigger>
        <SelectContent>
          {developers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {showMoveTo && columns && columns.length > 0 && moveToColumn !== undefined && setMoveToColumn && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Mover para</p>
          <Select value={moveToColumn} onValueChange={setMoveToColumn}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a lista" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (
                <SelectItem key={col.slug} value={col.slug}>
                  {col.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Observações / correções (DEV)</p>
        <Textarea
          placeholder="Descreva alterações técnicas, correções aplicadas, detalhes da implementação..."
          value={devNotes}
          onChange={e => setDevNotes(e.target.value)}
          rows={6}
          className="min-h-[120px] max-h-[min(35vh,280px)] resize-y overflow-y-auto focus-visible:ring-offset-0"
        />
      </div>

      {labels.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Etiquetas:</p>
          <div className="flex flex-wrap gap-1">
            {labels.map((l: any) => (
              <Badge key={l.id} variant={selectedLabels.includes(l.id) ? 'default' : 'outline'} className="cursor-pointer text-xs" style={selectedLabels.includes(l.id) ? { backgroundColor: l.color } : {}} onClick={() => toggleLabel(l.id)}>
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
                <KanbanCardImage imageUrl={img.image_url} className="rounded-md w-full h-20 object-cover border" />
                <button onClick={() => onDeleteImage(img.id)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-3 w-3" /></button>
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
                <button onClick={() => removePending(i)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> Anexar arquivos (qualquer formato) — arraste aqui ou</span>
          <label className="cursor-pointer text-primary hover:underline">
            selecionar
            <input type="file" accept="*/*" multiple className="hidden" onChange={handleFileSelect} />
          </label>
        </div>
        {pendingFiles.length > 0 && (
          <ul className="mt-2 space-y-1">
            {pendingFiles.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1">
                <span className="truncate text-foreground">{f.name}</span>
                <span className="shrink-0 text-[10px]">{formatSize(f.size)}</span>
                <button type="button" onClick={() => removePendingFile(i)} className="text-destructive shrink-0"><X className="h-3 w-3" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
          <ImagePlus className="h-3 w-3" /> Adicionar imagens
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
        </label>
        <span className="text-[10px] text-muted-foreground">ou CTRL+V para colar</span>
      </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background px-6 pb-3 pt-3">
        <Button onClick={onSubmit} disabled={loading || !title.trim()} className="w-full">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
        </Button>
      </div>
    </div>
  );
}
export default KanbanDev;
