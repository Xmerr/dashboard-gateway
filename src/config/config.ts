import { ConfigurationError } from "@xmer/consumer-shared";
import type { Config, SubgraphConfig } from "../types/index.js";

export function createConfig(
	env: Record<string, string | undefined> = process.env,
): Config {
	const port = parsePositiveInt(env.PORT, 4000);
	const subgraphs = parseSubgraphs(env.SUBGRAPHS);
	const rabbitmqUrl = requireEnv(env, "RABBITMQ_URL");
	const lokiHost = env.LOKI_HOST;
	const logLevel = env.LOG_LEVEL ?? "info";

	if (subgraphs.length === 0) {
		throw new ConfigurationError(
			"SUBGRAPHS must contain at least one subgraph",
			"SUBGRAPHS",
		);
	}

	return {
		port,
		subgraphs,
		rabbitmqUrl,
		lokiHost,
		logLevel,
	};
}

function parseSubgraphs(value: string | undefined): SubgraphConfig[] {
	if (!value) {
		throw new ConfigurationError(
			"Missing required environment variable: SUBGRAPHS. " +
				'Expected JSON array, e.g.: [{"name": "my-service", "url": "http://localhost:4002/graphql"}]',
			"SUBGRAPHS",
		);
	}

	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) {
			throw new Error("SUBGRAPHS must be a JSON array");
		}

		return parsed.map((sg, index) => {
			if (!sg.name || typeof sg.name !== "string") {
				throw new Error(
					`Subgraph at index ${index} missing required "name" field`,
				);
			}
			if (!sg.url || typeof sg.url !== "string") {
				throw new Error(`Subgraph "${sg.name}" missing required "url" field`);
			}
			return {
				name: sg.name,
				url: sg.url,
				wsUrl: sg.wsUrl,
			};
		});
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new ConfigurationError(
				`SUBGRAPHS is not valid JSON: ${error.message}`,
				"SUBGRAPHS",
			);
		}
		throw new ConfigurationError(
			`Invalid SUBGRAPHS configuration: ${(error as Error).message}`,
			"SUBGRAPHS",
		);
	}
}

function requireEnv(
	env: Record<string, string | undefined>,
	key: string,
): string {
	const value = env[key];
	if (!value) {
		throw new ConfigurationError(
			`Missing required environment variable: ${key}`,
			key,
		);
	}
	return value;
}

function parsePositiveInt(
	value: string | undefined,
	defaultValue: number,
): number {
	if (!value) return defaultValue;
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return defaultValue;
	}
	return parsed;
}
