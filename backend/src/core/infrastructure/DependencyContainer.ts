import type { Logger } from "../contracts/Logger";

import { ConsoleLogger } from "./ConsoleLogger";

export class DependencyContainer {
  private readonly loggerInstance: Logger;

  constructor() {
    this.loggerInstance = new ConsoleLogger();
  }

  get logger(): Logger {
    return this.loggerInstance;
  }
}

export const dependencyContainer =
  new DependencyContainer();