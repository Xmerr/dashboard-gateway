import { ConfigurationError } from "@xmer/consumer-shared";
import { beforeEach, describe, expect, it } from "bun:test";
import { createConfig } from "./config.js";

describe("createConfig", () => {
	let baseEnv: Record<string, string>;

	beforeEach(() => {
		baseEnv = {
			SUBGRAPHS: JSON.stringify([
				{ name: "docker-health-monitor", url: "http://localhost:4002/graphql" },
			]),
			RABBITMQ_URL: "amqp://localhost:5672",
		};
	});

	describe("required environment variables", () => {
		it("should throw ConfigurationError when SUBGRAPHS is missing", () => {
			// Arrange
			const env = { RABBITMQ_URL: "amqp://localhost:5672" };

			// Act & Assert
			expect(() => createConfig(env)).toThrow(ConfigurationError);
		});

		it("should throw ConfigurationError when RABBITMQ_URL is missing", () => {
			// Arrange
			const env = { SUBGRAPHS: baseEnv.SUBGRAPHS };

			// Act & Assert
			expect(() => createConfig(env)).toThrow(ConfigurationError);
		});

		it("should throw ConfigurationError when SUBGRAPHS is empty array", () => {
			// Arrange
			const env = { ...baseEnv, SUBGRAPHS: "[]" };

			// Act & Assert
			expect(() => createConfig(env)).toThrow(ConfigurationError);
		});

		it("should throw ConfigurationError when SUBGRAPHS is invalid JSON", () => {
			// Arrange
			const env = { ...baseEnv, SUBGRAPHS: "not-json" };

			// Act & Assert
			expect(() => createConfig(env)).toThrow(ConfigurationError);
		});

		it("should throw ConfigurationError when subgraph missing name", () => {
			// Arrange
			const env = {
				...baseEnv,
				SUBGRAPHS: JSON.stringify([{ url: "http://localhost:4002/graphql" }]),
			};

			// Act & Assert
			expect(() => createConfig(env)).toThrow(ConfigurationError);
		});

		it("should throw ConfigurationError when subgraph missing url", () => {
			// Arrange
			const env = {
				...baseEnv,
				SUBGRAPHS: JSON.stringify([{ name: "test-service" }]),
			};

			// Act & Assert
			expect(() => createConfig(env)).toThrow(ConfigurationError);
		});
	});

	describe("subgraph parsing", () => {
		it("should parse single subgraph", () => {
			// Act
			const config = createConfig(baseEnv);

			// Assert
			expect(config.subgraphs).toHaveLength(1);
			expect(config.subgraphs[0]).toEqual({
				name: "docker-health-monitor",
				url: "http://localhost:4002/graphql",
				wsUrl: undefined,
			});
		});

		it("should parse multiple subgraphs", () => {
			// Arrange
			const env = {
				...baseEnv,
				SUBGRAPHS: JSON.stringify([
					{ name: "service-a", url: "http://localhost:4001/graphql" },
					{ name: "service-b", url: "http://localhost:4002/graphql", wsUrl: "ws://localhost:4003/graphql" },
				]),
			};

			// Act
			const config = createConfig(env);

			// Assert
			expect(config.subgraphs).toHaveLength(2);
			expect(config.subgraphs[0]?.name).toBe("service-a");
			expect(config.subgraphs[1]?.name).toBe("service-b");
			expect(config.subgraphs[1]?.wsUrl).toBe("ws://localhost:4003/graphql");
		});

		it("should include wsUrl when provided", () => {
			// Arrange
			const env = {
				...baseEnv,
				SUBGRAPHS: JSON.stringify([
					{ name: "test", url: "http://localhost:4002/graphql", wsUrl: "ws://localhost:4003/graphql" },
				]),
			};

			// Act
			const config = createConfig(env);

			// Assert
			expect(config.subgraphs[0]?.wsUrl).toBe("ws://localhost:4003/graphql");
		});
	});

	describe("default values", () => {
		it("should use default port of 4000", () => {
			// Act
			const config = createConfig(baseEnv);

			// Assert
			expect(config.port).toBe(4000);
		});

		it("should use default logLevel of info", () => {
			// Act
			const config = createConfig(baseEnv);

			// Assert
			expect(config.logLevel).toBe("info");
		});

		it("should have undefined lokiHost by default", () => {
			// Act
			const config = createConfig(baseEnv);

			// Assert
			expect(config.lokiHost).toBeUndefined();
		});
	});

	describe("custom values", () => {
		it("should parse custom PORT", () => {
			// Arrange
			const env = { ...baseEnv, PORT: "8080" };

			// Act
			const config = createConfig(env);

			// Assert
			expect(config.port).toBe(8080);
		});

		it("should parse LOKI_HOST", () => {
			// Arrange
			const env = { ...baseEnv, LOKI_HOST: "http://loki:3100" };

			// Act
			const config = createConfig(env);

			// Assert
			expect(config.lokiHost).toBe("http://loki:3100");
		});

		it("should parse LOG_LEVEL", () => {
			// Arrange
			const env = { ...baseEnv, LOG_LEVEL: "debug" };

			// Act
			const config = createConfig(env);

			// Assert
			expect(config.logLevel).toBe("debug");
		});
	});

	describe("port validation", () => {
		it("should use default for invalid PORT", () => {
			// Arrange
			const env = { ...baseEnv, PORT: "invalid" };

			// Act
			const config = createConfig(env);

			// Assert
			expect(config.port).toBe(4000);
		});

		it("should use default for negative PORT", () => {
			// Arrange
			const env = { ...baseEnv, PORT: "-1" };

			// Act
			const config = createConfig(env);

			// Assert
			expect(config.port).toBe(4000);
		});

		it("should use default for zero PORT", () => {
			// Arrange
			const env = { ...baseEnv, PORT: "0" };

			// Act
			const config = createConfig(env);

			// Assert
			expect(config.port).toBe(4000);
		});
	});
});
