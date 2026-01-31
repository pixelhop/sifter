import { validateConfig } from "../utils/config";

export default defineNitroPlugin(() => {
  // Validate environment configuration on startup
  try {
    validateConfig();
    console.log("Environment configuration validated successfully");
  } catch (error) {
    console.error("Failed to validate environment configuration");
    process.exit(1);
  }
});
