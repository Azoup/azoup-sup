import { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ImageLightboxProps {
  images: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const STEP = 0.25;

export function ImageLightbox({ images, index, onClose, onIndexChange }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const reset = useCallback(() => { setZoom(1); setOffset({ x: 0, y: 0 }); }, []);

  useEffect(() => { reset(); }, [index, reset]);

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
    setOffset({ x: dragRef.current.ox + (e.clientX - dragRef.current.x), y: dragRef.current.oy + (e.clientY - dragRef.current.y) });
  };
  const onPointerUp = () => { dragRef.current = null; };

  // Touch pinch
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
  const onTouchEnd = () => { pinchRef.current = null; };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && images.length > 1) onIndexChange((index - 1 + images.length) % images.length);
      else if (e.key === 'ArrowRight' && images.length > 1) onIndexChange((index + 1) % images.length);
      else if (e.key === '+' || e.key === '=') zoomAt(STEP);
      else if (e.key === '-') zoomAt(-STEP);
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onIndexChange, reset]);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl p-2 bg-black/90 border-none">
        <DialogHeader className="sr-only">
          <DialogTitle>Visualizar imagem</DialogTitle>
          <DialogDescription>Imagem {index + 1} de {images.length}</DialogDescription>
        </DialogHeader>
        <div
          className="relative flex items-center justify-center min-h-[60vh] overflow-hidden select-none"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ cursor: zoom > 1 ? (dragRef.current ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }}
        >
          <img
            src={images[index]}
            alt=""
            draggable={false}
            className="max-h-[80vh] max-w-full object-contain rounded transition-transform duration-75"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: 'center center' }}
          />
          {images.length > 1 && (
            <>
              <button
                onClick={() => onIndexChange((index - 1 + images.length) % images.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white rounded-full p-2"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={() => onIndexChange((index + 1) % images.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white rounded-full p-2"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button onClick={() => zoomAt(-STEP)} className="flex items-center gap-1 text-white/80 hover:text-white text-xs bg-white/20 hover:bg-white/30 rounded px-2 py-1.5 transition-colors" title="Zoom -">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-white/80 text-xs min-w-[3rem] text-center font-mono">{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomAt(STEP)} className="flex items-center gap-1 text-white/80 hover:text-white text-xs bg-white/20 hover:bg-white/30 rounded px-2 py-1.5 transition-colors" title="Zoom +">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button onClick={reset} className="flex items-center gap-1 text-white/80 hover:text-white text-xs bg-white/20 hover:bg-white/30 rounded px-2 py-1.5 transition-colors" title="Resetar zoom">
            <RotateCcw className="h-4 w-4" />
          </button>
          <span className="text-white/60 text-xs px-2">{index + 1} / {images.length}</span>
          <a
            href={images[index]}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-white/80 hover:text-white text-xs bg-white/20 hover:bg-white/30 rounded px-3 py-1.5 transition-colors"
          >
            <Download className="h-4 w-4" /> Baixar
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
