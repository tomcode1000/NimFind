/// <reference types="vite/client" />

// The Hub's standalone build has no bundled types; only the call NimFind uses is declared.
declare module "@nimiq/hub-api/dist/standalone/HubApi.standalone.es.js" {
  export default class HubApi {
    constructor(endpoint?: string);
    chooseAddress(request: { appName: string }): Promise<{ address: string; label: string }>;
  }
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
