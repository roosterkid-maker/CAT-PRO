import "dotenv/config";

function required(
  value: string | undefined,
  name: string,
): string {
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}

export const exchangeConfig = {
  coinDCX: {
    apiKey: required(
      process.env.COINDCX_API_KEY,
      "d76ca78d19b609e870e4a00d728520e6030ad673da50c023",
    ),

    apiSecret: required(
      process.env.COINDCX_API_SECRET,
      "1b848aa3f0b8a6f66a2e431ed53b60d57fd37a3677e399cffc19737f1edb4bd4",
    ),
  },
};