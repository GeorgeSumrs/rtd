import { handler } from "@/lib/auth-server";

async function logAndHandle(request: Request) {
  console.log("[api/auth] request method:", request.method);
  console.log("[api/auth] request url:", request.url);
  console.log("[api/auth] request origin:", request.headers.get("origin"));
  console.log("[api/auth] request referer:", request.headers.get("referer"));

  const response =
    request.method === "GET"
      ? await handler.GET(request)
      : await handler.POST(request);

  console.log("[api/auth] response status:", response.status);
  console.log("[api/auth] response location:", response.headers.get("location"));

  return response;
}

export async function GET(request: Request) {
  return logAndHandle(request);
}

export async function POST(request: Request) {
  return logAndHandle(request);
}
