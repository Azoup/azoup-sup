export class TimeoutError extends Error {
  constructor(message = 'Operação expirou') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Evita promessas penduradas (rede lenta, sessão corrompida, etc.). */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Operação expirou. Verifique a ligação e tente novamente.',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
