export async function GET() {
  const response = await fetch("https://reddynk.substack.com/feed");
  return new Response(await response.text(), {
    status: response.status,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400" }
  });
}
