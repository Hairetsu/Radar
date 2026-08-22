let controller = new AbortController();

export function assessmentTrafficSignal() {
  if (controller.signal.aborted) {
    controller = new AbortController();
  }
  return controller.signal;
}

export function stopAssessmentTraffic() {
  if (!controller.signal.aborted) {
    controller.abort();
  }
  controller = new AbortController();
}

export function delayWithSignal(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Stop Traffic Now aborted the experiment queue."));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, ms));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Stop Traffic Now aborted the experiment queue."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
