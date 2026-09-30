import { addListener, ensureLoaded } from "~/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await ensureLoaded();
  const encoder = new TextEncoder();
  let unsubscribe = () => {
    /* replaced once the stream starts */
  };
  let ping: NodeJS.Timeout | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };
      send(": connected\n\n");
      unsubscribe = addListener((event, data) => {
        send(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      });
      ping = setInterval(() => {
        try {
          send(": ping\n\n");
        } catch {
          if (ping) clearInterval(ping);
        }
      }, 25_000);
      ping.unref();
    },
    cancel() {
      if (ping) clearInterval(ping);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
