// The public URL path for one job — a standalone copy of
// functions/lib/jobs-feed.js jobSlug().
//
// This service runs on its own host (Render), so it cannot import from
// ../functions. But the links it puts in the digest MUST resolve on the site,
// so the two implementations cannot be allowed to drift: tests/whatsapp-digest.test.js
// compares this copy against the production one for sample rows. If you change
// one, change both and keep that test green.
//
// Readable words first, then the row's uuid after "--". The uuid is what makes
// the lookup unambiguous and, more importantly, what keeps an OLD url working:
// the feed rewrites listing titles now and then, and a slug built from the title
// alone would move the page out from under its own ranking and 404.
export const jobSlug = (j) => {
  const id = String(j && j.id ? j.id : "").trim();
  const words = [j && j.title, j && j.company, j && j.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return words ? `${words}--${id}` : id;
};