import { dependencyContainer } from "../infrastructure/DependencyContainer";

export class Application {
  async initialize(): Promise<void> {
    dependencyContainer.logger.info(
      "Initializing Crypto Arbitrage Engine...",
    );

    dependencyContainer.logger.info(
      "Application initialized successfully.",
    );
  }
}

export const application =
  new Application();