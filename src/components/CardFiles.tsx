import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { notifyDevAndAnalyst } from '@/hooks/useDevNotifications';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Paperclip, Download, Trash2, FileText, FileVideo, FileImage, File as FileIcon, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

interface CardFilesProps {
  cardId: string;
}

interface UploadStatus {
  name: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIcon(type: string | null) {
  if (!type) return FileIcon;
  if (type.startsWith('image/')) return FileImage;
  if (type.startsWith('video/')) return FileVideo;
  if (type.includes('pdf') || type.includes('text') || type.includes('xml') || type.includes('json')) return FileText;
  return FileIcon;
}

export function CardFiles({ cardId }: CardFilesProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<any>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['dev-card-files', cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kanban_card_files')
        .select('*')
        .eq('card_id', cardId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!cardId,
  });

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`${file.name}: excede o limite de 100MB`);
      return;
    }

    const idx = uploads.length;
    setUploads(prev => [...prev, { name: file.name, progress: 0, status: 'uploading' }]);

    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${cardId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      // Simulated progress (Supabase JS SDK doesn't expose upload progress directly)
      const progressInterval = setInterval(() => {
        setUploads(prev => prev.map((u, i) =>
          i === idx && u.status === 'uploading' && u.progress < 90
            ? { ...u, progress: u.progress + 10 }
            : u
        ));
      }, 300);

      const { error: uploadError } = await supabase.storage
        .from('kanban-files')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('kanban-files').getPublicUrl(path);

      const { error: dbError } = await supabase.from('kanban_card_files').insert({
        card_id: cardId,
        file_url: urlData.publicUrl,
        file_path: path,
        file_name: file.name,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
        uploaded_by: user?.id,
        uploaded_by_email: user?.email || '',
      });

      if (dbError) throw dbError;

      setUploads(prev => prev.map((u, i) => i === idx ? { ...u, progress: 100, status: 'done' } : u));
      queryClient.invalidateQueries({ queryKey: ['dev-card-files', cardId] });

      // Notify developer AND analyst about the new attachment
      const { data: card } = await supabase
        .from('dev_kanban_cards')
        .select('title, developer_id, analyst_id')
        .eq('id', cardId)
        .maybeSingle();
      if (card && (card.developer_id || card.analyst_id)) {
        const actorName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Alguém';
        await notifyDevAndAnalyst({
          cardId, cardTitle: card.title,
          developerId: card.developer_id, analystId: card.analyst_id,
          actionType: 'attachment', actorId: user?.id, actorName,
          message: `${actorName} anexou "${file.name}" ao ticket "${card.title}"`,
        });
      }

      // Remove from list after delay
      setTimeout(() => {
        setUploads(prev => prev.filter((_, i) => i !== idx));
      }, 2000);
    } catch (e: any) {
      setUploads(prev => prev.map((u, i) => i === idx ? { ...u, status: 'error', error: e.message } : u));
      toast.error(`Erro ao enviar ${file.name}: ${e.message}`);
    }
  }, [cardId, uploads.length, user, queryClient]);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach(uploadFile);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const file = files.find((f: any) => f.id === deleteId);
    if (!file) return;
    try {
      await supabase.storage.from('kanban-files').remove([file.file_path]);
      const { error } = await supabase.from('kanban_card_files').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success('Arquivo removido');
      queryClient.invalidateQueries({ queryKey: ['dev-card-files', cardId] });
    } catch (e: any) {
      toast.error(`Erro ao remover: ${e.message}`);
    } finally {
      setDeleteId(null);
    }
  };

  const canPreview = (type: string | null) => {
    if (!type) return false;
    return type.startsWith('image/') || type.startsWith('video/') || type === 'application/pdf'
      || type.startsWith('text/') || type.includes('xml') || type.includes('json');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Anexos {files.length > 0 && <span className="text-muted-foreground">({files.length})</span>}
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5 mr-1" />
          Anexar arquivos
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="truncate">{u.name}</span>
                <span className="text-muted-foreground ml-2">
                  {u.status === 'uploading' && `${u.progress}%`}
                  {u.status === 'done' && '✓ Concluído'}
                  {u.status === 'error' && '✗ Erro'}
                </span>
              </div>
              <Progress value={u.progress} className="h-1.5" />
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nenhum arquivo anexado</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f: any) => {
            const Icon = getFileIcon(f.file_type);
            return (
              <li key={f.id} className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{f.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(f.file_size)} • {format(new Date(f.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canPreview(f.file_type) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setPreviewFile(f)}
                      title="Visualizar"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <a
                    href={f.file_url}
                    download={f.file_name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
                    title="Baixar"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(f.id)}
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover arquivo?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!previewFile} onOpenChange={(o) => !o && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{previewFile?.file_name}</DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="w-full">
              {previewFile.file_type?.startsWith('image/') && (
                <img src={previewFile.file_url} alt={previewFile.file_name} className="w-full h-auto rounded" />
              )}
              {previewFile.file_type?.startsWith('video/') && (
                <video src={previewFile.file_url} controls className="w-full rounded" />
              )}
              {previewFile.file_type === 'application/pdf' && (
                <iframe src={previewFile.file_url} className="w-full h-[70vh] rounded border" title={previewFile.file_name} />
              )}
              {(previewFile.file_type?.startsWith('text/') || previewFile.file_type?.includes('xml') || previewFile.file_type?.includes('json')) && (
                <iframe src={previewFile.file_url} className="w-full h-[70vh] rounded border bg-white" title={previewFile.file_name} />
              )}
              <div className="mt-3 flex justify-end">
                <a
                  href={previewFile.file_url}
                  download={previewFile.file_name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <Download className="h-3.5 w-3.5" /> Baixar
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
