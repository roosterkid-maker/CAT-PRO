import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";

import {
  dirname,
  resolve,
} from "node:path";

import {
  fileURLToPath,
} from "node:url";

const repositoryRoot =
  resolve(
    dirname(
      fileURLToPath(import.meta.url),
    ),
    "..",
  );

const failures = [];

const actualStrategies = [
  ["cross-exchange-arbitrage", "CrossExchangeArbitrageStrategyController.ts"],
  ["cross-exchange-market-making", "CrossExchangeMarketMakingStrategyController.ts"],
  ["triangular-arbitrage", "TriangularArbitrageStrategyController.ts"],
  ["spot-perpetual-basis-arbitrage", "SpotPerpetualBasisStrategyController.ts"],
  ["funding-rate-arbitrage", "FundingRateArbitrageStrategyController.ts"],
  ["perpetual-perpetual-arbitrage", "PerpetualPerpetualArbitrageStrategyController.ts"],
  ["dynamic-market-making", "DynamicMarketMakingStrategyController.ts"],
  ["statistical-arbitrage", "StatisticalArbitrageStrategyController.ts"],
];

function repositoryPath(
  relativePath,
) {
  return resolve(
    repositoryRoot,
    relativePath,
  );
}

function requirePath(
  relativePath,
) {
  if (
    !existsSync(
      repositoryPath(relativePath),
    )
  ) {
    failures.push(
      `Missing canonical path: ${relativePath}`,
    );
  }
}

function forbidPath(
  relativePath,
) {
  if (
    existsSync(
      repositoryPath(relativePath),
    )
  ) {
    failures.push(
      `Legacy or duplicate path must not exist: ${relativePath}`,
    );
  }
}

function readRepositoryFile(
  relativePath,
) {
  return readFileSync(
    repositoryPath(relativePath),
    "utf8",
  );
}

for (
  const relativePath
  of [
    "backend/src/server.ts",
    "backend/src/strategies/config/ActualStrategyCatalog.ts",
    "backend/src/strategies/hedge-inventory-management",
    "backend/src/workflows/cross-exchange-arbitrage/models/UnifiedAutomatedExecution.ts",
    "backend/src/workflows/cross-exchange-arbitrage/models/StrategyOnePaperRuntimeAcceptance.ts",
    "backend/src/workflows/cross-exchange-arbitrage/services/UnifiedAutomatedExecutionOrchestratorService.ts",
    "backend/src/workflows/cross-exchange-arbitrage/services/StrategyOnePaperRuntimeAcceptanceService.ts",
    "backend/src/analytics/services/StrategyAttributionAnalyticsService.ts",
  ]
) {
  requirePath(relativePath);
}

for (const [directory, controllerFile] of actualStrategies) {
  requirePath(
    `backend/src/strategies/${directory}/${controllerFile}`,
  );
}

for (
  const relativePath
  of [
    "backend/src/app.ts",
    "src/strategies",
    "src/automation/strategies",
    "backend/src/automation/strategies",
    "frontend/src/modules/automation/strategies",
    "backend/src/strategies/cross-exchange-arbitrage/runtime",
    "backend/src/strategies/services/StrategyAttributionAnalyticsService.ts",
    "backend/src/automation/models/UnifiedAutomatedExecution.ts",
    "backend/src/automation/models/StrategyOnePaperRuntimeAcceptance.ts",
    "backend/src/automation/services/UnifiedAutomatedExecutionOrchestratorService.ts",
    "backend/src/automation/services/StrategyOnePaperRuntimeAcceptanceService.ts",
    "backend/src/automation/services/StrategyAttributionAnalyticsService.ts",
  ]
) {
  forbidPath(relativePath);
}

const automationControllerFiles =
  readdirSync(
    repositoryPath("backend/src/automation"),
    {
      recursive: true,
      withFileTypes: true,
    },
  ).filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(
        "StrategyController.ts",
      ),
  );

if (automationControllerFiles.length > 0) {
  failures.push(
    "Automation must not contain strategy-controller implementations.",
  );
}

const strategyBootstrap =
  readRepositoryFile(
    "backend/src/strategies/bootstrap/StrategyBootstrap.ts",
  );

const registrationCount =
  strategyBootstrap.match(
    /strategyRegistry\.register\s*\(/g,
  )?.length ?? 0;

if (
  registrationCount !==
    actualStrategies.length
) {
  failures.push(
    `Strategy bootstrap must contain exactly ${actualStrategies.length} registrations; found ${registrationCount}.`,
  );
}

const viteConfig =
  readRepositoryFile(
    "frontend/vite.config.ts",
  );

if (
  !viteConfig.includes(
    'port: 5173',
  ) ||
  !viteConfig.includes(
    'target: "http://127.0.0.1:5000"',
  ) ||
  !viteConfig.includes(
    'target: "ws://127.0.0.1:5000"',
  )
) {
  failures.push(
    "Vite must own local port 5173 and proxy API plus Socket.IO to backend port 5000.",
  );
}

const backendEnvironment =
  readRepositoryFile(
    "backend/src/config/Environment.ts",
  );

if (
  !/"PORT",\s*5000/.test(
    backendEnvironment,
  ) ||
  !/"CAT_PRO_BACKEND_HOST",\s*"127\.0\.0\.1"/.test(
    backendEnvironment,
  ) ||
  !backendEnvironment.includes(
    '"http://localhost:5173"',
  )
) {
  failures.push(
    "Backend environment defaults must remain port 5000 with frontend origin 5173.",
  );
}

const backendServer =
  readRepositoryFile(
    "backend/src/server.ts",
  );

if (
  !/server\.listen\(\s*PORT,\s*environment\.backendHost,/.test(
    backendServer,
  )
) {
  failures.push(
    "Backend server must bind the explicitly configured canonical host and port.",
  );
}

const compose =
  readRepositoryFile(
    "docker-compose.yml",
  );

if (
  !compose.includes(
    'CAT_PRO_BACKEND_HOST: "0.0.0.0"',
  )
) {
  failures.push(
    "Compose must explicitly expose the backend inside its private container network.",
  );
}

const runtimeUrls =
  readRepositoryFile(
    "frontend/src/config/runtimeUrls.ts",
  );

if (
  !runtimeUrls.includes(
    "window.location.origin",
  ) ||
  runtimeUrls.includes(
    "8081",
  ) ||
  runtimeUrls.includes(
    "localhost:5000",
  )
) {
  failures.push(
    "Frontend runtime URLs must use the browser origin and must not bypass the local same-origin proxy.",
  );
}

const rootPackage =
  JSON.parse(
    readRepositoryFile(
      "package.json",
    ),
  );

const backendPackage =
  JSON.parse(
    readRepositoryFile(
      "backend/package.json",
    ),
  );

if (
  rootPackage.scripts?.["dev:backend"] !==
    "npm run dev --prefix backend" ||
  rootPackage.scripts?.["dev:frontend"] !==
    "npm run dev --prefix frontend" ||
  backendPackage.scripts?.dev !==
    "ts-node src/server.ts" ||
  backendPackage.scripts?.start !==
    "node dist/server.js"
) {
  failures.push(
    "Development and production scripts must use the single canonical server entrypoint.",
  );
}

const configuredPortFiles = [
  ".env.example",
  "backend/.env.example",
  "frontend/.env.example",
  "frontend/vite.config.ts",
  "docker-compose.yml",
  "nginx/nginx.conf",
];

if (
  existsSync(
    repositoryPath(
      "frontend/.env",
    ),
  )
) {
  configuredPortFiles.push(
    "frontend/.env",
  );
}

for (
  const relativePath
  of configuredPortFiles
) {
  const content =
    readRepositoryFile(
      relativePath,
    );

  if (
    content.includes(
      "8081",
    )
  ) {
    failures.push(
      `Retired port 8081 is still configured in ${relativePath}.`,
    );
  }
}

if (
  failures.length >
    0
) {
  console.error(
    "CAT PRO architecture boundary check FAILED:",
  );

  for (
    const failure
    of failures
  ) {
    console.error(
      `- ${failure}`,
    );
  }

  process.exitCode =
    1;
} else {
  console.log(
    "CAT PRO architecture boundary check PASS: 8 strategies, one backend entrypoint, canonical ports 5000/5173, no duplicate automation strategy tree.",
  );
}
