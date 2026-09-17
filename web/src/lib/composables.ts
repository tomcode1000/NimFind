import { onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { ApiError } from "./api";
import { signOut } from "./session";

/** Runs a callback on an interval while the component is mounted and the page is visible. */
export function usePolling(callback: () => unknown, intervalMs: number) {
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") void callback();
  }, intervalMs);
  onUnmounted(() => clearInterval(timer));
}

/** Sends the owner back to sign in when their session has expired. */
export function useAuthGuard() {
  const router = useRouter();
  return (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      signOut();
      void router.replace("/");
      return true;
    }
    return false;
  };
}

/** Waits for a payment the server has not seen on chain yet, checking every few seconds. */
export async function waitForConfirmation(check: () => Promise<boolean>, attempts = 20, delayMs = 3000): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}
