/**
 * Options for the retry mechanism
 */
export interface RetryOptions {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    shouldRetry?: (error: any) => boolean;
}

/**
 * Default options for retry
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    shouldRetry: (error: any) => {
        // Retry on standard network errors or 429/5xx status codes
        if (error?.message?.includes('network')) return true;
        if (error?.status === 429) return true;
        if (error?.status >= 500 && error?.status < 600) return true;
        return false;
    }
};

/**
 * Waits for a specified duration
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wraps a function with retry logic using exponential backoff
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let attempt = 0;
    let delay = config.initialDelay!;

    while (true) {
        try {
            return await fn();
        } catch (error: any) {
            attempt++;

            // Check if we should stop retrying
            if (attempt > config.maxRetries! || (config.shouldRetry && !config.shouldRetry(error))) {
                throw error;
            }

            console.warn(`[Retry] Attempt ${attempt} failed. Retrying in ${delay}ms...`, error.message);

            // Wait before next attempt
            await wait(delay);

            // Calculate next delay with backoff
            delay = Math.min(delay * config.backoffFactor!, config.maxDelay!);
        }
    }
}
