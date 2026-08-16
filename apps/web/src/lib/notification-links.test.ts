import { describe, expect, it } from "vitest";
import { notificationDestination } from "./notification-links";

const organisationId = "35d03ace-3fef-4e63-b42a-c5899a44f477";
const projectId = "af2d8e74-6957-4671-9c37-8a15f5958d11";
const base = `/app/${organisationId}/projects/${projectId}`;

describe("notification destinations", () => {
  it("accepts known pages inside the notification project", () => {
    expect(notificationDestination({ href: `${base}/reviews`, organisationId, projectId })).toBe(`${base}/reviews`);
    expect(notificationDestination({ href: `${base}/assignments?view=action`, organisationId, projectId })).toBe(`${base}/assignments?view=action`);
    expect(notificationDestination({ href: `${base}/reports/11111111-1111-4111-8111-111111111111`, organisationId, projectId })).toBe(`${base}/reports/11111111-1111-4111-8111-111111111111`);
  });

  it("rejects external, cross-project and unknown destinations", () => {
    expect(notificationDestination({ href: "https://example.com", organisationId, projectId })).toBeNull();
    expect(notificationDestination({ href: `/app/${organisationId}/projects/11111111-1111-4111-8111-111111111111/reviews`, organisationId, projectId })).toBeNull();
    expect(notificationDestination({ href: `${base}/unknown`, organisationId, projectId })).toBeNull();
  });

  it("rejects path traversal and malformed destinations", () => {
    expect(notificationDestination({ href: `${base}/documents/../settings`, organisationId, projectId })).toBeNull();
    expect(notificationDestination({ href: `${base}\\documents`, organisationId, projectId })).toBeNull();
  });
});
