// Cloudflare Pages Function — Route: GET /for-recruiters
// See functions/lib/content-pages.js for the page and the honesty rules it obeys.
import { contentPageResponse } from "./lib/content-pages.js";

export function onRequestGet() {
  return contentPageResponse("for-recruiters");
}