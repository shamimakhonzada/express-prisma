import dotenv from "dotenv";

dotenv.config();

const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
};

if (!config.jwtAccessSecret) {
  throw new Error(
    "CRITICAL: JWT_ACCESS_SECRET environmental variable is missing.",
  );
}

if (!config.jwtRefreshSecret) {
  throw new Error(
    "CRITICAL: JWT_REFRESH_SECRET environmental variable is missing.",
  );
}

export default config;
