import type { TagKind } from "./api";
import type { IconName } from "./icons";

export const KIND_ICONS: Record<TagKind, IconName> = {
  phone: "phone",
  keys: "keys",
  bag: "shopping-bag",
  wallet: "credit-card",
  laptop: "laptop",
  other: "tag",
};

/** Headline shown to finders on wallpapers, stickers and the finder page. */
export const KIND_HEADLINES: Record<TagKind, string> = {
  phone: "Found this phone?",
  keys: "Found these keys?",
  bag: "Found this bag?",
  wallet: "Found this wallet?",
  laptop: "Found this laptop?",
  other: "Found this?",
};
