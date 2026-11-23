// Câte cereri către server sunt în curs (pentru bara de încărcare de sus).
let inFlight = 0;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(inFlight));

export function trackRequest(promise) {
    inFlight += 1;
    emit();
    return promise.finally(() => {
        inFlight = Math.max(0, inFlight - 1);
        emit();
    });
}

export function subscribeLoading(fn) {
    listeners.add(fn);
    fn(inFlight);
    return () => listeners.delete(fn);
}
