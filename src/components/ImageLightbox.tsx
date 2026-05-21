import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, RotateCcw, ImageOff, X } from 'lucide-react';
import { kanbanImageDisplayCandidates } from '@/lib/kanbanImageUrl';
import { cn } from '@/lib/utils';

interface ImageLightboxProps {
  /** URLs gravadas no banco (raw); normalização ocorre internamente. */
  images: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const STEP = 0.25;

function LightboxSlide({
  storedUrl,
  zoom,
  offset,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  dragRef,
}: {
  storedUrl: string;
  zoom: number;
  offset: { x: number; y: number };
  onWheel: (e: React.WheelEvent) => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  dragRef: React.MutableRefObject<{ x: number; y: number; ox: number; oy: number } | null>;
}) {
  const candidates = useMemo(() => kanbanImageDisplayCandidates(storedUrl), [storedUrl]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = candidates[candidateIndex];

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [storedUrl]);

  return (
    <div
      className="relative flex min-h-[60vh] w-full items-center justify-center overflow-hidden select-none"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        cursor: zoom > 1 ? (dragRef.current ? 'grabbing' : 'grab') : 'default',
        touchAction: 'none',
      }}
    >
      {!src || failed ? (
        <div className="flex flex-col items-center gap-2 text-white/70">
          <ImageOff className="h-12 w-12 opacity-60" />
          <span className="text-sm">Não foi possível carregar a imagem</span>
        </div>
      ) : (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          decoding="async"
          className="max-h-[80vh] max-w-full rounded object-contain transition-transform duration-75"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
          onError={() => {
            if (candidateIndex < candidates.length - 1) {
              setCandidateIndex((i) => i + 1);
              return;
            }
            setFailed(true);
          }}
        />
      )}
    </div>
  );
}

export function ImageLightbox({ images, index, onClose, onIndexChange }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
  }, [index, reset]);

  const downloadSrc = useMemo(() => {
    const list = kanbanImageDisplayCandidates(images[index]);
    return list[0] ?? images[index];
  }, [images, index]);

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const zoomAt = (delta: number) => {
    setZoom((z) => {
      const nz = clampZoom(z + delta);
      if (nz === 1) setOffset({ x: 0, y: 0 });
      return nz;
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomAt(e.deltaY > 0 ? -STEP : STEP);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.x),
      y: dragRef.current.oy + (e.clientY - dragRef.current.y),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), zoom };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      setZoom(clampZoom(pinchRef.current.zoom * (dist / pinchRef.current.dist)));
    }
  };
  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && images.length > 1) {
        onIndexChange((index - 1 + images.length) % images.length);
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        onIndexChange((index + 1) % images.length);
      } else if (e.key === '+' || e.key === '=') zoomAt(STEP);
      else if (e.key === '-') zoomAt(-STEP);
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onIndexChange, reset]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="z-[200] bg-black/85" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-[200] grid w-full max-w-5xl translate-x-[-50%] translate-y-[-50%] gap-2 border-none bg-zinc-950 p-2 shadow-lg duration-200 sm:rounded-lg',
          )}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Visualizar imagem</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Imagem {index + 1} de {images.length}
          </DialogPrimitive.Description>

          <LightboxSlide
            storedUrl={images[index]}
            zoom={zoom}
            offset={offset}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            dragRef={dragRef}
          />

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => onIndexChange((index - 1 + images.length) % images.length)}
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => onIndexChange((index + 1) % images.length)}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => zoomAt(-STEP)}
              className="flex items-center gap-1 rounded bg-white/20 px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/30 hover:text-white"
              title="Zoom -"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-[3rem] text-center font-mono text-xs text-white/80">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => zoomAt(STEP)}
              className="flex items-center gap-1 rounded bg-white/20 px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/30 hover:text-white"
              title="Zoom +"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1 rounded bg-white/20 px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/30 hover:text-white"
              title="Resetar zoom"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs text-white/60">
              {index + 1} / {images.length}
            </span>
            <a
              href={downloadSrc}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded bg-white/20 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/30 hover:text-white"
            >
              <Download className="h-4 w-4" /> Baixar
            </a>
          </div>

          <DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm text-white/80 ring-offset-background transition-opacity hover:text-white focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-5 w-5" />
            <span className="sr-only">Fechar</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
