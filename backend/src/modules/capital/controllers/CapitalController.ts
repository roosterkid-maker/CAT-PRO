import type {
  Request,
  Response,
} from "express";

import { capitalFacade } from "../facades/CapitalFacade";
import type { CapitalAllocationRequest } from "../models/CapitalAllocationRequest";

export class CapitalController {
  getState(
    _request: Request,
    response: Response,
  ): void {
    response.status(200).json({
      success: true,
      data: capitalFacade.getState(),
    });
  }

  initialize(
    request: Request,
    response: Response,
  ): void {
    try {
      const state = capitalFacade.initialize({
        totalCapital: Number(
          request.body.totalCapital,
        ),

        maxConcurrentTrades: Number(
          request.body.maxConcurrentTrades,
        ),

        maxCapitalPerTrade: Number(
          request.body.maxCapitalPerTrade,
        ),

        minimumReserveCapital: Number(
          request.body.minimumReserveCapital,
        ),
      });

      response.status(200).json({
        success: true,
        data: state,
      });
    } catch (error) {
      this.handleError(response, error);
    }
  }

  checkAllocation(
    request: Request,
    response: Response,
  ): void {
    try {
      const allocationRequest =
        this.createAllocationRequest(
          request,
        );

      const result =
        capitalFacade.checkAllocation(
          allocationRequest,
        );

      response.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      this.handleError(response, error);
    }
  }

  allocate(
    request: Request,
    response: Response,
  ): void {
    try {
      const allocationRequest =
        this.createAllocationRequest(
          request,
        );

      const result =
        capitalFacade.allocate(
          allocationRequest,
        );

      response.status(
        result.approved ? 200 : 422,
      ).json({
        success: result.approved,
        data: result,
      });
    } catch (error) {
      this.handleError(response, error);
    }
  }

  release(
    request: Request,
    response: Response,
  ): void {
    try {
 const state = capitalFacade.release(
  Number(request.body.amount),
);

      response.status(200).json({
        success: true,
        data: state,
      });
    } catch (error) {
      this.handleError(response, error);
    }
  }

  reserve(
    request: Request,
    response: Response,
  ): void {
    try {
      const state = capitalFacade.reserve({
        amount: Number(
          request.body.amount,
        ),
      });

      response.status(200).json({
        success: true,
        data: state,
      });
    } catch (error) {
      this.handleError(response, error);
    }
  }

  recordProfit(
    request: Request,
    response: Response,
  ): void {
    try {
      const state =
        capitalFacade.recordProfit({
          amount: Number(
            request.body.amount,
          ),
        });

      response.status(200).json({
        success: true,
        data: state,
      });
    } catch (error) {
      this.handleError(response, error);
    }
  }

  recordLoss(
    request: Request,
    response: Response,
  ): void {
    try {
      const state =
        capitalFacade.recordLoss({
          amount: Number(
            request.body.amount,
          ),
        });

      response.status(200).json({
        success: true,
        data: state,
      });
    } catch (error) {
      this.handleError(response, error);
    }
  }

  resetDailyMetrics(
    _request: Request,
    response: Response,
  ): void {
    try {
      const state =
        capitalFacade.resetDailyMetrics();

      response.status(200).json({
        success: true,
        data: state,
      });
    } catch (error) {
      this.handleError(response, error);
    }
  }

  private createAllocationRequest(
    request: Request,
  ): CapitalAllocationRequest {
    return {
      opportunityId: String(
        request.body.opportunityId ?? "",
      ),

      requestedCapital: Number(
        request.body.requestedCapital,
      ),

      expectedProfitPercent: Number(
        request.body.expectedProfitPercent,
      ),

      priority: Number(
        request.body.priority,
      ),
    };
  }

  private handleError(
    response: Response,
    error: unknown,
  ): void {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected capital engine error.";

    response.status(400).json({
      success: false,
      error: message,
    });
  }
}

export const capitalController =
  new CapitalController();