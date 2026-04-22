/**
 * PCS dispatch package builder.
 * Ported from pcs-soap.service.ts to be shared across SOAP + REST paths.
 * Pure function; reads env only.
 */

export interface DispatchPackage {
  companyObjectId: string;
  loadNumber: string;
  driverName: string;
  truckNumber: string;
  originName: string;
  destinationName: string;
  commodity: string;
  weight: string;
  dispatchDate: string;
  companyName: string;
  companyLetter: string;
  trailerNumber: string;
  status: string;
}

export interface AssignmentInput {
  id: number;
  status: string;
}

export interface LoadInput {
  loadNo: string;
  driverName: string | null;
  truckNo: string | null;
  trailerNo: string | null;
  originName: string | null;
  destinationName: string | null;
  productDescription: string | null;
  weightTons: string | null;
}

export interface WellInput {
  name: string;
}

export function buildDispatchPackage(
  assignment: AssignmentInput,
  load: LoadInput,
  well: WellInput,
): DispatchPackage {
  const companyId = process.env.PCS_COMPANY_ID ?? "";
  const companyName = process.env.PCS_COMPANY_NAME ?? "";
  const companyLetter = process.env.PCS_COMPANY_LTR ?? "B";

  return {
    companyObjectId: companyId,
    loadNumber: load.loadNo,
    driverName: load.driverName ?? "",
    truckNumber: load.truckNo ?? "",
    trailerNumber: load.trailerNo ?? "",
    originName: load.originName ?? "",
    destinationName: well.name,
    commodity: load.productDescription ?? "",
    weight: load.weightTons ?? "0",
    dispatchDate: new Date().toISOString(),
    companyName,
    companyLetter,
    status: "DISPATCHED",
  };
}
