import { createLogger } from "@xmer/consumer-shared";
import { createConfig } from "./config/config.js";
import { createGateway } from "./gateway/apollo-gateway.js";

async function main(): Promise<void> {
	const config = createConfig();

	const logger = createLogger({
		job: "dashboard-gateway",
		environment: process.env.NODE_ENV ?? "production",
		level: config.logLevel as "debug" | "info" | "warn" | "error",
		loki: config.lokiHost ? { host: config.lokiHost } : undefined,
	});

	logger.info("Starting dashboard-gateway");

	const gateway = createGateway({
		port: config.port,
		subgraphs: config.subgraphs,
		logger,
	});

	await gateway.start();

	logger.info("dashboard-gateway is running", {
		port: config.port,
		subgraphs: config.subgraphs.map((sg) => sg.name),
	});

	// Graceful shutdown
	const shutdown = async (): Promise<void> => {
		logger.info("Shutting down...");

		await gateway.stop();

		logger.info("Shutdown complete");
		process.exit(0);
	};

	process.on("SIGTERM", () => void shutdown());
	process.on("SIGINT", () => void shutdown());
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
