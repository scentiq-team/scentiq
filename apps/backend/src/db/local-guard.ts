// "Is this database on this computer?" Used by the destructive tools (db:reset, seed:dev) so a
// wrong URL in .env cannot wipe or fill a shared database by accident.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * True only when every host the driver could connect to is local. The driver (`pg`) lets
 * `?host=` and `?hostaddr=` override the host part of the URL, so those are checked as well:
 * `postgres://u:p@localhost/db?host=prod.example.com` connects to prod.example.com.
 * A host that starts with "/" is a Unix socket folder, which is always local.
 */
export function isLocalDatabaseUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const hosts = [
    parsed.hostname,
    parsed.searchParams.get('host'),
    parsed.searchParams.get('hostaddr'),
  ].filter((host): host is string => host !== null && host !== '');
  return hosts.length > 0 && hosts.every((host) => LOCAL_HOSTS.has(host) || host.startsWith('/'));
}
