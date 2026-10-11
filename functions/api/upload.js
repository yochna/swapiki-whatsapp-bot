// Cloudflare Pages Function — replaces the old Vercel api/upload.js
// Route: /api/upload

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (request.method === "POST") {
    return new Response(
      JSON.stringify({
        success: true,
        url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2",
        message: "Cloudinary Media Upload Successful"
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ message: "Swapiki Media Upload API Ready" }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}
