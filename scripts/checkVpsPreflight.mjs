import {
  accessSync,
  constants,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const backendEnvironmentPath = resolve(
  projectRoot,
  "backend",
  ".env",
);
const rootEnvironmentPath = resolve(
  projectRoot,
  ".env",
);

const checks = [];

function readStage() {
  const inline =
    process.argv.find(
      (argument) =>
        argument.startsWith(
          "--stage=",
        ),
    );

  const normalized =
    (
      inline
        ? inline.slice(
            "--stage=".length,
          )
        : "shadow"
    )
      .trim()
      .toLowerCase();

  if (
    normalized !==
      "shadow" &&
    normalized !==
      "paper"
  ) {
    throw new Error(
      "VPS preflight stage must be shadow or paper.",
    );
  }

  return normalized;
}

const deploymentStage =
  readStage();

function record(level, name, detail) {
  checks.push({ level, name, detail });
}

function readEnvironmentFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const environment = {};

  for (const line of readFileSync(
    filePath,
    "utf8",
  ).split(/\r?\n/)) {
    const normalizedLine = line.trim();

    if (
      !normalizedLine ||
      normalizedLine.startsWith("#")
    ) {
      continue;
    }

    const separatorIndex =
      normalizedLine.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const name = normalizedLine
      .slice(0, separatorIndex)
      .trim();
    let value = normalizedLine
      .slice(separatorIndex + 1)
      .trim();

    if (
      value.length >= 2 &&
      ((value.startsWith('"') &&
        value.endsWith('"')) ||
        (value.startsWith("'") &&
          value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    environment[name] = value;
  }

  return environment;
}

const rootEnvironment =
  readEnvironmentFile(rootEnvironmentPath);
const backendEnvironment =
  readEnvironmentFile(backendEnvironmentPath);
const environment = {
  ...rootEnvironment,
  ...backendEnvironment,
  ...process.env,
};

const requiredFiles = [
  ".env.example",
  "docker-compose.yml",
  "docker-compose.paper.yml",
  "backend/Dockerfile",
  "frontend/Dockerfile",
  "nginx/nginx.conf",
];

const composePath = resolve(
  projectRoot,
  "docker-compose.yml",
);

for (const relativePath of requiredFiles) {
  const absolutePath = resolve(
    projectRoot,
    relativePath,
  );

  record(
    existsSync(absolutePath)
      ? "PASS"
      : "FAIL",
    `Deployment file: ${relativePath}`,
    existsSync(absolutePath)
      ? "present"
      : "missing",
  );
}

if (existsSync(composePath)) {
  const composeSource =
    readFileSync(
      composePath,
      "utf8",
    );

  const maximumSizeDeclarations =
    composeSource.match(
      /max-size:\s*["']10m["']/g,
    )?.length ??
    0;

  const maximumFileDeclarations =
    composeSource.match(
      /max-file:\s*["']5["']/g,
    )?.length ??
    0;

  const allServiceLogsRotated =
    maximumSizeDeclarations ===
      3 &&
    maximumFileDeclarations ===
      3;

  record(
    allServiceLogsRotated
      ? "PASS"
      : "FAIL",
    "Container log rotation",
    allServiceLogsRotated
      ? "backend, frontend, and gateway are capped at 10m x 5 files"
      : "all three services must declare max-size=10m and max-file=5",
  );
}

if (existsSync(backendEnvironmentPath)) {
  record(
    "PASS",
    "Backend environment file",
    "present; values were not printed",
  );
} else {
  record(
    "FAIL",
    "Backend environment file",
    "backend/.env is missing",
  );
}

const paperSafetyChecks = [
  {
    name: "TRADING_MODE",
    valid: (value) =>
      !value || value.toLowerCase() === "paper",
  },
  {
    name: "TRADING_EXECUTION_MODE",
    valid: (value) =>
      !value || value.toLowerCase() === "paper",
  },
  {
    name: "LIVE_TRADING_ENABLED",
    valid: (value) =>
      !value ||
      value.toLowerCase() === "false" ||
      value === "0",
  },
  {
    name: "ARBITRAGE_LIVE_CONFIRMATION",
    valid: (value) => !value,
  },
  {
    name: "LIVE_TRADING_CONFIRMATION",
    valid: (value) => !value,
  },
  {
    name: "LIVE_ORDER_SUBMISSION_CONFIRMATION",
    valid: (value) => !value,
  },
];

for (const check of paperSafetyChecks) {
  const value = environment[check.name]?.trim();
  const valid = check.valid(value);

  record(
    valid ? "PASS" : "FAIL",
    `Fail-closed setting: ${check.name}`,
    valid
      ? "safe for SHADOW/PAPER deployment"
      : "unsafe value is configured; value intentionally hidden",
  );
}

const publicOrigin =
  environment.CAT_PRO_PUBLIC_ORIGIN?.trim() ||
  environment.FRONTEND_ORIGIN?.trim();

function isSecurePublicOrigin(value) {
  if (!value) {
    return false;
  }

  try {
    const parsed =
      new URL(value);

    const hostname =
      parsed.hostname
        .toLowerCase();

    const placeholderOrLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      /(?:^|\.)(?:example\.(?:com|net|org)|invalid|test)$/i.test(
        hostname,
      );

    const normalizedInput =
      value.endsWith("/")
        ? value.slice(0, -1)
        : value;

    return (
      parsed.protocol ===
        "https:" &&
      !placeholderOrLocal &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname ===
        "/" &&
      !parsed.search &&
      !parsed.hash &&
      parsed.origin ===
        normalizedInput
    );
  } catch {
    return false;
  }
}

const securePublicOrigin =
  isSecurePublicOrigin(
    publicOrigin,
  );

record(
  securePublicOrigin ? "PASS" : "FAIL",
  "Public HTTPS origin",
  securePublicOrigin
    ? "configured; value intentionally hidden"
    : "set CAT_PRO_PUBLIC_ORIGIN to a real exact HTTPS dashboard origin (no placeholder, path, query, or credentials)",
);

const credentialGroups = [
  [
    "CoinDCX",
    [
      "COINDCX_API_KEY",
      "COINDCX_API_SECRET",
    ],
  ],
  [
    "Binance",
    [
      "BINANCE_API_KEY",
      "BINANCE_API_SECRET",
    ],
  ],
  [
    "Bybit",
    [
      "BYBIT_API_KEY",
      "BYBIT_API_SECRET",
    ],
  ],
  [
    "CoinSwitch",
    [
      "COINSWITCH_API_KEY",
      "COINSWITCH_API_SECRET",
    ],
  ],
  [
    "UnoCoin",
    ["UNOCOIN_API_TOKEN"],
  ],
];

for (const [exchange, names] of credentialGroups) {
  const missingNames = names.filter(
    (name) =>
      !environment[name]?.trim(),
  );

  record(
    missingNames.length === 0
      ? "PASS"
      : "FAIL",
    `${exchange} read-only credentials`,
    missingNames.length === 0
      ? "configured; values were not printed"
      : `missing key name(s): ${missingNames.join(
          ", ",
        )}`,
  );
}

const paperConfirmation =
  environment
    .AUTOMATED_PAPER_TRADING_CONFIRMATION
    ?.trim();

const composePaperConfirmation =
  environment
    .CAT_PRO_PAPER_CONFIRMATION
    ?.trim();

const shadowPaperUnarmed =
  !paperConfirmation &&
  !composePaperConfirmation;

const paperExplicitlyArmed =
  composePaperConfirmation ===
  "ENABLE_AUTOMATED_PAPER_TRADING";

record(
  deploymentStage ===
    "shadow"
    ? shadowPaperUnarmed
      ? "PASS"
      : "FAIL"
    : paperExplicitlyArmed
      ? "PASS"
      : "FAIL",
  `Automated PAPER arming (${deploymentStage})`,
  deploymentStage ===
    "shadow"
    ? shadowPaperUnarmed
      ? "PAPER is unarmed for the initial SHADOW deployment"
      : "clear AUTOMATED_PAPER_TRADING_CONFIRMATION and CAT_PRO_PAPER_CONFIRMATION for SHADOW deployment"
    : paperExplicitlyArmed
      ? "the exact PAPER-only Compose confirmation is configured"
      : "set CAT_PRO_PAPER_CONFIRMATION to the exact PAPER-only confirmation and use docker-compose.paper.yml",
);

const persistencePath = resolve(
  projectRoot,
  "backend",
  "logs",
);

try {
  const persistenceStatus =
    statSync(persistencePath);
  accessSync(
    persistencePath,
    constants.R_OK | constants.W_OK,
  );

  record(
    persistenceStatus.isDirectory()
      ? "PASS"
      : "FAIL",
    "Persistent evidence directory",
    persistenceStatus.isDirectory()
      ? "backend/logs is readable and writable"
      : "backend/logs is not a directory",
  );
} catch {
  record(
    "FAIL",
    "Persistent evidence directory",
    "backend/logs must exist and be readable/writable",
  );
}

const dockerResult = spawnSync(
  "docker",
  ["compose", "version"],
  {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  },
);

record(
  dockerResult.status === 0
    ? "PASS"
    : "FAIL",
  "Docker Compose",
  dockerResult.status === 0
    ? "available"
    : "not available on this host",
);

if (
  dockerResult.status ===
  0
) {
  const composeConfigResult =
    spawnSync(
      "docker",
      [
        "compose",
        "-f",
        composePath,
        ...(
          deploymentStage ===
          "paper"
            ? [
                "-f",
                resolve(
                  projectRoot,
                  "docker-compose.paper.yml",
                ),
              ]
            : []
        ),
        "config",
        "--quiet",
      ],
      {
        cwd:
          projectRoot,
        encoding:
          "utf8",
        shell:
          false,
        windowsHide:
          true,
      },
    );

  record(
    composeConfigResult.status ===
      0
      ? "PASS"
      : "FAIL",
    "Docker Compose configuration",
    composeConfigResult.status ===
      0
      ? "configuration resolves successfully"
      : "configuration validation failed; output intentionally hidden",
  );
} else {
  record(
    "WARN",
    "Docker Compose configuration",
    "not evaluated because Docker Compose is unavailable",
  );
}

for (const check of checks) {
  console.log(
    `[${check.level}] ${check.name}: ${check.detail}`,
  );
}

const failures = checks.filter(
  (check) => check.level === "FAIL",
).length;
const warnings = checks.filter(
  (check) => check.level === "WARN",
).length;

console.log(
  `VPS preflight result: ${
    failures === 0 ? "PASS" : "BLOCKED"
  }; stage=${deploymentStage}; failures=${failures}; warnings=${warnings}.`,
);
console.log(
  "This preflight performs no exchange request, order submission, capital action, or secret output.",
);

process.exitCode = failures === 0 ? 0 : 1;
