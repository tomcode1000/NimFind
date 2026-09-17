import { reactive } from "vue";
import { api, type AppConfig } from "./api";
import { signMessage } from "./nimiq-pay";

const TOKEN_KEY = "nimfind.session";
const ADDRESS_KEY = "nimfind.address";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in some webviews; the session then lasts for this visit only.
  }
}

export const session = reactive({
  token: read(TOKEN_KEY),
  address: read(ADDRESS_KEY),
  config: null as AppConfig | null,
});

export async function signIn() {
  const challenge = await api.challenge();
  const signature = await signMessage(challenge.message);
  const result = await api.verify({ nonce: challenge.nonce, publicKey: signature.publicKey, signature: signature.signature });
  session.token = result.token;
  session.address = result.address;
  write(TOKEN_KEY, result.token);
  write(ADDRESS_KEY, result.address);
}

export function signOut() {
  session.token = null;
  session.address = null;
  write(TOKEN_KEY, null);
  write(ADDRESS_KEY, null);
}

export async function loadConfig(): Promise<AppConfig> {
  session.config ??= await api.config();
  return session.config;
}

/** Remembers finder conversations on this device, so a finder can find their way back. */
export const finderTokens = {
  get(reportId: string): string | null {
    return read(`nimfind.finder.${reportId}`);
  },
  set(reportId: string, token: string) {
    write(`nimfind.finder.${reportId}`, token);
  },
};
