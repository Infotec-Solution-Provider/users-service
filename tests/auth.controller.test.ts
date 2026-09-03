import express from "express";
import type { AddressInfo } from "node:net";
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET_KEY = "test-jwt-secret-with-sufficient-entropy";
process.env.REFRESH_TOKEN_PEPPER = "test-refresh-pepper-with-sufficient-entropy";
process.env.AUTH_REFRESH_ENABLED = "true";

let authService: typeof import("../src/services/auth.service").default;
let authController: typeof import("../src/controllers/auth.controller").default;

beforeAll(async () => {
  authService = (await import("../src/services/auth.service")).default;
  authController = (await import("../src/controllers/auth.controller")).default;
});

describe("auth controller handler binding", () => {
  it("preserves the controller context while reading the logout cookie", async () => {
    const logout = vi.spyOn(authService, "logout").mockResolvedValue();
    const app = express();
    app.use(express.json());
    app.use("/api", authController.router);
    const server = app.listen(0);

    try {
      const address = server.address() as AddressInfo;
      const instance = "tenant-a";
      const cookieName = authService.getRefreshCookieName(instance);
      const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${cookieName}=session.secret`,
        },
        body: JSON.stringify({ instance }),
      });

      expect(response.status).toBe(204);
      expect(logout).toHaveBeenCalledWith(instance, "session.secret");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
