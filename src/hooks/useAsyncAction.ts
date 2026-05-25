import { useCallback, useState } from "react";

export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>
) {
  const [isPending, setIsPending] = useState(false);

  const run = useCallback(
    async (...args: TArgs) => {
      setIsPending(true);
      try {
        return await action(...args);
      } finally {
        setIsPending(false);
      }
    },
    [action]
  );

  return { run, isPending };
}
