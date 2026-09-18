import { createRouter, createWebHistory } from "vue-router";
import { session } from "./lib/session";

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: "/", component: () => import("./views/Home.vue") },
    { path: "/t/:code", component: () => import("./views/FinderTag.vue") },
    { path: "/r/:id", component: () => import("./views/FinderReport.vue") },
    { path: "/w/:token", component: () => import("./views/WallpaperExport.vue") },
    { path: "/app/tags/new", component: () => import("./views/TagNew.vue"), meta: { owner: true } },
    { path: "/app/tags/:code", component: () => import("./views/TagDetail.vue"), meta: { owner: true } },
    { path: "/app/tags/:code/wallpaper", component: () => import("./views/WallpaperStudio.vue"), meta: { owner: true } },
    { path: "/app/tags/:code/stickers", component: () => import("./views/StickerSheet.vue"), meta: { owner: true } },
    { path: "/app/inbox", component: () => import("./views/Inbox.vue"), meta: { owner: true } },
    { path: "/app/reports/:id", component: () => import("./views/OwnerReport.vue"), meta: { owner: true } },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach((to) => {
  if (to.meta.owner && !session.token) return "/";
});
