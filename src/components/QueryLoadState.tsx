import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QueryLoadStateProps {
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  errorMessage?: string;
  loadingClassName?: string;
  children: React.ReactNode;
}

/** Evita spinner infinito: mostra erro + retry quando a query falha ou expira. */
export function QueryLoadState({
  isLoading,
  isError,
  onRetry,
  errorMessage = 'Não foi possível carregar. Verifique a ligação e tente novamente.',
  loadingClassName = 'py-4',
  children,
}: QueryLoadStateProps) {
  if (isLoading) {
    return (
      <div className={`flex justify-center ${loadingClassName}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={`text-center space-y-2 ${loadingClassName}`}>
        <p className="text-xs text-muted-foreground">{errorMessage}</p>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Tentar novamente
          </Button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
