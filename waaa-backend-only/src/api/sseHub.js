/*
==================================================
WAAA SSE HUB
==================================================
Minimal pub/sub over plain HTTP Server-Sent Events.
No extra dependency (no socket.io) — Express + native
res.write is enough for one-way server -> browser push,
which is all the frontend needs (connection status,
QR updates, new messages).
==================================================
*/

import { EventEmitter } from "events";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export const hub = {
  publish(event, data) {
    emitter.emit(event, data);
  },

  // Attaches an Express response as an SSE client subscribed to `events`.
  subscribe(res, events = []) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(":ok\n\n");

    const listeners = events.map((eventName) => {
      const listener = (data) => {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      emitter.on(eventName, listener);

      return { eventName, listener };
    });

    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 25000);

    res.req.on("close", () => {
      clearInterval(heartbeat);
      listeners.forEach(({ eventName, listener }) => {
        emitter.off(eventName, listener);
      });
    });
  },
};
