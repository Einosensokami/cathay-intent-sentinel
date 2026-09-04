import { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { FacilitatorOptions } from "./settle.js";
import { Facilitator } from "./settle.js";
export interface FacilitatorHttpOptions extends FacilitatorOptions {
    onError?: (error: unknown, request: IncomingMessage) => void;
}
export declare function handleFacilitatorRequest(request: IncomingMessage, response: ServerResponse, facilitator: Facilitator, options?: Pick<FacilitatorHttpOptions, "onError">): Promise<void>;
export declare function createFacilitatorServer(options: FacilitatorHttpOptions): Server;
export declare const createServerForFacilitator: typeof createFacilitatorServer;
export declare const createFacilitatorHttpServer: typeof createFacilitatorServer;
