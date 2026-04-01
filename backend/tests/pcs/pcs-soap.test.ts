import { describe, it, expect, beforeAll } from "vitest";

describe("PCS SOAP Service", () => {
  let service: typeof import("../../src/plugins/pcs/services/pcs-soap.service.js");

  beforeAll(async () => {
    service =
      await import("../../src/plugins/pcs/services/pcs-soap.service.js");
  });

  // -------------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------------

  describe("exports", () => {
    it("exports all required functions", () => {
      expect(typeof service.mapPcsToInternal).toBe("function");
      expect(typeof service.mapInternalToPcs).toBe("function");
      expect(typeof service.getSession).toBe("function");
      expect(typeof service.buildDispatchPackage).toBe("function");
      expect(typeof service.dispatch).toBe("function");
      expect(typeof service.postStatus).toBe("function");
      expect(typeof service.sendDispatchMessage).toBe("function");
      expect(typeof service.clearRoutes).toBe("function");
      expect(typeof service.healthCheck).toBe("function");
      expect(typeof service.diagnostics).toBe("function");
    });

    it("exports status mapping tables", () => {
      expect(service.PCS_TO_INTERNAL).toBeDefined();
      expect(service.INTERNAL_TO_PCS).toBeDefined();
      expect(typeof service.PCS_TO_INTERNAL).toBe("object");
      expect(typeof service.INTERNAL_TO_PCS).toBe("object");
    });

    it("exports PCS_DISPATCH_ENABLED flag", () => {
      expect(typeof service.PCS_DISPATCH_ENABLED).toBe("boolean");
    });

    it("exports PCS_ENDPOINTS", () => {
      expect(service.PCS_ENDPOINTS).toBeDefined();
      expect(service.PCS_ENDPOINTS.WSExpressSupport).toBe(
        "http://ws.xpresstrax.com/WSExpressSupport.asmx",
      );
      expect(service.PCS_ENDPOINTS.NS_Email).toBe(
        "http://ws.xpresstrax.com/NS_Email.asmx",
      );
    });

    it("exports DispatchPackage type via buildDispatchPackage return shape", () => {
      // Type-level check: the function exists and returns the right shape
      const pkg = service.buildDispatchPackage(
        { id: 1, status: "dispatch_ready" },
        {
          loadNo: "L-001",
          driverName: "Test",
          truckNo: "T1",
          trailerNo: "TR1",
          originName: "Origin",
          destinationName: "Dest",
          productDescription: "Sand",
          weightTons: "25.5",
        },
        { name: "Well A" },
      );
      expect(pkg).toHaveProperty("companyObjectId");
      expect(pkg).toHaveProperty("loadNumber");
    });
  });

  // -------------------------------------------------------------------------
  // mapPcsToInternal
  // -------------------------------------------------------------------------

  describe("mapPcsToInternal", () => {
    const expectedMappings: [string, string][] = [
      ["DISPATCHED", "dispatched"],
      ["IN TRANSIT", "in_transit"],
      ["AT ORIGIN", "at_origin"],
      ["LOADING", "loading"],
      ["LOADED", "loaded"],
      ["EN ROUTE", "en_route"],
      ["AT DESTINATION", "at_destination"],
      ["UNLOADING", "unloading"],
      ["DELIVERED", "delivered"],
      ["CANCELLED", "cancelled"],
      ["COMPLETED", "completed"],
      ["ON HOLD", "on_hold"],
      ["REJECTED", "rejected"],
    ];

    it.each(expectedMappings)(
      'maps PCS "%s" to internal "%s"',
      (pcsStatus, expected) => {
        expect(service.mapPcsToInternal(pcsStatus)).toBe(expected);
      },
    );

    it("returns null for unknown PCS status", () => {
      expect(service.mapPcsToInternal("UNKNOWN_STATUS")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(service.mapPcsToInternal("")).toBeNull();
    });

    it("is case-sensitive (lowercase returns null)", () => {
      expect(service.mapPcsToInternal("dispatched")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // mapInternalToPcs
  // -------------------------------------------------------------------------

  describe("mapInternalToPcs", () => {
    const expectedMappings: [string, string][] = [
      ["dispatched", "DISPATCHED"],
      ["in_transit", "IN TRANSIT"],
      ["at_origin", "AT ORIGIN"],
      ["loading", "LOADING"],
      ["loaded", "LOADED"],
      ["en_route", "EN ROUTE"],
      ["at_destination", "AT DESTINATION"],
      ["unloading", "UNLOADING"],
      ["delivered", "DELIVERED"],
      ["cancelled", "CANCELLED"],
      ["completed", "COMPLETED"],
      ["on_hold", "ON HOLD"],
      ["rejected", "REJECTED"],
    ];

    it.each(expectedMappings)(
      'maps internal "%s" to PCS "%s"',
      (internalStatus, expected) => {
        expect(service.mapInternalToPcs(internalStatus)).toBe(expected);
      },
    );

    it("returns null for unknown internal status", () => {
      expect(service.mapInternalToPcs("unknown_status")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(service.mapInternalToPcs("")).toBeNull();
    });

    it("returns null for statuses with no PCS equivalent (pending)", () => {
      expect(service.mapInternalToPcs("pending")).toBeNull();
    });

    it("returns null for statuses with no PCS equivalent (assigned)", () => {
      expect(service.mapInternalToPcs("assigned")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Bidirectional consistency
  // -------------------------------------------------------------------------

  describe("status mapping consistency", () => {
    it("PCS_TO_INTERNAL and INTERNAL_TO_PCS are consistent inverses", () => {
      // Every value in INTERNAL_TO_PCS should be a key in PCS_TO_INTERNAL
      for (const [internal, pcs] of Object.entries(service.INTERNAL_TO_PCS)) {
        expect(service.PCS_TO_INTERNAL[pcs]).toBe(internal);
      }
    });

    it("both tables have exactly 13 entries", () => {
      expect(Object.keys(service.PCS_TO_INTERNAL)).toHaveLength(13);
      expect(Object.keys(service.INTERNAL_TO_PCS)).toHaveLength(13);
    });
  });

  // -------------------------------------------------------------------------
  // buildDispatchPackage
  // -------------------------------------------------------------------------

  describe("buildDispatchPackage", () => {
    const mockAssignment = { id: 42, status: "dispatch_ready" };
    const mockLoad = {
      loadNo: "L-12345",
      driverName: "John Doe",
      truckNo: "T-100",
      trailerNo: "TR-200",
      originName: "Terminal A",
      destinationName: "Some Dest",
      productDescription: "Frac Sand",
      weightTons: "25.5000",
    };
    const mockWell = { name: "Well Site Alpha #1" };

    it("returns correct shape with all required fields", () => {
      const pkg = service.buildDispatchPackage(
        mockAssignment,
        mockLoad,
        mockWell,
      );

      expect(pkg).toEqual(
        expect.objectContaining({
          companyObjectId: expect.any(String),
          loadNumber: "L-12345",
          driverName: "John Doe",
          truckNumber: "T-100",
          trailerNumber: "TR-200",
          originName: "Terminal A",
          destinationName: "Well Site Alpha #1",
          commodity: "Frac Sand",
          weight: "25.5000",
          dispatchDate: expect.any(String),
          companyName: expect.any(String),
          companyLetter: expect.any(String),
          status: "DISPATCHED",
        }),
      );
    });

    it("uses well name as destinationName (not load destination)", () => {
      const pkg = service.buildDispatchPackage(
        mockAssignment,
        mockLoad,
        mockWell,
      );
      expect(pkg.destinationName).toBe("Well Site Alpha #1");
    });

    it("handles null load fields gracefully (defaults to empty string)", () => {
      const nullLoad = {
        loadNo: "L-001",
        driverName: null,
        truckNo: null,
        trailerNo: null,
        originName: null,
        destinationName: null,
        productDescription: null,
        weightTons: null,
      };

      const pkg = service.buildDispatchPackage(
        mockAssignment,
        nullLoad,
        mockWell,
      );

      expect(pkg.driverName).toBe("");
      expect(pkg.truckNumber).toBe("");
      expect(pkg.trailerNumber).toBe("");
      expect(pkg.originName).toBe("");
      expect(pkg.commodity).toBe("");
      expect(pkg.weight).toBe("0");
    });

    it("sets status to DISPATCHED", () => {
      const pkg = service.buildDispatchPackage(
        mockAssignment,
        mockLoad,
        mockWell,
      );
      expect(pkg.status).toBe("DISPATCHED");
    });

    it("defaults companyLetter to B when env not set", () => {
      const original = process.env.PCS_COMPANY_LTR;
      delete process.env.PCS_COMPANY_LTR;

      const pkg = service.buildDispatchPackage(
        mockAssignment,
        mockLoad,
        mockWell,
      );
      expect(pkg.companyLetter).toBe("B");

      if (original) process.env.PCS_COMPANY_LTR = original;
    });

    it("uses env vars for company fields", () => {
      const origId = process.env.PCS_COMPANY_ID;
      const origName = process.env.PCS_COMPANY_NAME;
      const origLtr = process.env.PCS_COMPANY_LTR;

      process.env.PCS_COMPANY_ID = "TEST-123";
      process.env.PCS_COMPANY_NAME = "Test Company";
      process.env.PCS_COMPANY_LTR = "X";

      const pkg = service.buildDispatchPackage(
        mockAssignment,
        mockLoad,
        mockWell,
      );

      expect(pkg.companyObjectId).toBe("TEST-123");
      expect(pkg.companyName).toBe("Test Company");
      expect(pkg.companyLetter).toBe("X");

      // Restore
      if (origId) process.env.PCS_COMPANY_ID = origId;
      else delete process.env.PCS_COMPANY_ID;
      if (origName) process.env.PCS_COMPANY_NAME = origName;
      else delete process.env.PCS_COMPANY_NAME;
      if (origLtr) process.env.PCS_COMPANY_LTR = origLtr;
      else delete process.env.PCS_COMPANY_LTR;
    });

    it("dispatchDate is a valid ISO string", () => {
      const pkg = service.buildDispatchPackage(
        mockAssignment,
        mockLoad,
        mockWell,
      );
      const parsed = new Date(pkg.dispatchDate);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  // -------------------------------------------------------------------------
  // PCS_DISPATCH_ENABLED
  // -------------------------------------------------------------------------

  describe("PCS_DISPATCH_ENABLED", () => {
    it("reflects env var (defaults to false)", () => {
      // In test env, PCS_DISPATCH_ENABLED is not set
      expect(service.PCS_DISPATCH_ENABLED).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // diagnostics
  // -------------------------------------------------------------------------

  describe("diagnostics", () => {
    it("returns valid diagnostic shape", () => {
      const diag = service.diagnostics();

      expect(diag.name).toBe("pcs-soap");
      expect(["healthy", "degraded", "error"]).toContain(diag.status);
      expect(diag.stats).toBeDefined();
      expect(diag.checks).toBeInstanceOf(Array);
      expect(diag.checks.length).toBeGreaterThanOrEqual(4);
    });

    it("includes circuit-breaker check", () => {
      const diag = service.diagnostics();
      const cbCheck = diag.checks.find((c) => c.name === "circuit-breaker");
      expect(cbCheck).toBeDefined();
      expect(cbCheck!.ok).toBe(true); // fresh breaker is closed
    });

    it("includes dispatch-flag check", () => {
      const diag = service.diagnostics();
      const flagCheck = diag.checks.find((c) => c.name === "dispatch-flag");
      expect(flagCheck).toBeDefined();
      expect(flagCheck!.detail).toBe("disabled"); // PCS_DISPATCH_ENABLED not set in tests
    });

    it("reports dispatchEnabled in stats", () => {
      const diag = service.diagnostics();
      expect(diag.stats.dispatchEnabled).toBe(false);
    });
  });
});
