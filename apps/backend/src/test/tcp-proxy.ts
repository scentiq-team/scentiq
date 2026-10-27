// A tiny TCP forwarder used to "switch the database off and on" in a test without touching the
// real server: stopping it drops every open connection and refuses new ones, starting it again
// lets connections through.
import net from 'node:net';

export interface TcpProxy {
  port: number;
  stop(): Promise<void>;
  start(): Promise<void>;
}

export async function createTcpProxy(target: { host: string; port: number }): Promise<TcpProxy> {
  const sockets = new Set<net.Socket>();
  let server: net.Server | undefined;
  let port = 0;

  const listen = (wantedPort: number) =>
    new Promise<void>((resolve, reject) => {
      const next = net.createServer((client) => {
        const upstream = net.connect(target.port, target.host);
        for (const socket of [client, upstream]) {
          sockets.add(socket);
          socket.on('close', () => sockets.delete(socket));
          socket.on('error', () => socket.destroy());
        }
        client.pipe(upstream);
        upstream.pipe(client);
      });
      next.once('error', reject);
      next.listen(wantedPort, '127.0.0.1', () => {
        server = next;
        port = (next.address() as net.AddressInfo).port;
        resolve();
      });
    });

  await listen(0);
  return {
    get port() {
      return port;
    },
    async stop() {
      const current = server;
      server = undefined;
      for (const socket of sockets) socket.destroy();
      if (current !== undefined)
        await new Promise<void>((resolve) => current.close(() => resolve()));
    },
    start: () => listen(port),
  };
}
