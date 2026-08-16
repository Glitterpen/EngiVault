const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export function notificationDestination({
  href,
  organisationId,
  projectId,
}: {
  href: string | null;
  organisationId: string | null;
  projectId: string | null;
}) {
  if (href === "/app" && !organisationId && !projectId) return href;
  if (!href || !organisationId || !projectId) return null;
  if (href.includes("\\") || href.split(/[?#]/, 1)[0].split("/").includes("..")) return null;

  const base = `/app/${organisationId}/projects/${projectId}`;
  if (href === base) return href;
  if (!href.startsWith(`${base}/`)) return null;

  const relativePath = href.slice(base.length).split(/[?#]/, 1)[0];
  const allowed = new RegExp(
    `^/(?:overview|control|reviews|assignments|progress|team|search|chat|settings|reports(?:/${UUID})?|documents(?:/${UUID})?(?:/.*)?|work-packages(?:/${UUID})?(?:/.*)?)$`,
    "i",
  );
  return allowed.test(relativePath) ? href : null;
}
