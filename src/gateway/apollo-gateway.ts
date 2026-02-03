import { createServer as createHttpServer } from "node:http";
import { ApolloGateway, IntrospectAndCompose } from "@apollo/gateway";
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import type { ILogger } from "@xmer/consumer-shared";
import { type Client, createClient } from "graphql-ws";
import { WebSocket, WebSocketServer } from "ws";
import type {
	GatewayInstance,
	GatewayOptions,
	SubgraphConfig,
} from "../types/index.js";

// Derive WebSocket URL from HTTP URL if not explicitly provided
function getWsUrl(subgraph: SubgraphConfig): string | null {
	if (subgraph.wsUrl) {
		return subgraph.wsUrl;
	}
	// No wsUrl means this subgraph doesn't support subscriptions
	return null;
}

export function createGateway(options: GatewayOptions): GatewayInstance {
	const { port, subgraphs, logger } = options;
	const gatewayLogger = logger.child({ component: "ApolloGateway" });

	// Apollo Gateway for federated queries
	const gateway = new ApolloGateway({
		supergraphSdl: new IntrospectAndCompose({
			subgraphs: subgraphs.map((sg) => ({
				name: sg.name,
				url: sg.url,
			})),
		}),
	});

	const server = new ApolloServer({
		gateway,
	});

	// WebSocket server for subscription passthrough
	const httpServer = createHttpServer();
	const wsServer = new WebSocketServer({
		server: httpServer,
		path: "/graphql",
	});

	// Track active client connections for cleanup
	const activeClients = new Set<WebSocket>();

	// Build map of subgraphs that support subscriptions
	const wsSubgraphs = subgraphs
		.map((sg) => ({ name: sg.name, wsUrl: getWsUrl(sg) }))
		.filter((sg): sg is { name: string; wsUrl: string } => sg.wsUrl !== null);

	gatewayLogger.debug("Subgraphs with WebSocket support", {
		subgraphs: wsSubgraphs.map((sg) => sg.name),
	});

	wsServer.on("connection", (clientWs) => {
		activeClients.add(clientWs);
		gatewayLogger.debug("WebSocket client connected");

		// Create upstream connections to all subscription-enabled subgraphs
		const upstreamClients = new Map<string, Client>();
		for (const sg of wsSubgraphs) {
			upstreamClients.set(
				sg.name,
				createClient({
					url: sg.wsUrl,
					webSocketImpl: WebSocket,
				}),
			);
		}

		// Track active subscriptions by ID
		const subscriptions = new Map<string, () => void>();

		clientWs.on("message", (data) => {
			try {
				const message = JSON.parse(data.toString());

				// Handle graphql-ws protocol messages
				if (message.type === "connection_init") {
					clientWs.send(JSON.stringify({ type: "connection_ack" }));
					return;
				}

				if (message.type === "subscribe" && message.payload?.query) {
					const { id, payload } = message;

					// For now, forward to all subscription-enabled subgraphs
					// TODO: Parse query to determine which subgraph to use
					for (const [name, client] of upstreamClients) {
						const unsubscribe = client.subscribe(
							{ query: payload.query, variables: payload.variables },
							{
								next: (result) => {
									clientWs.send(
										JSON.stringify({
											id,
											type: "next",
											payload: result,
										}),
									);
								},
								error: (err) => {
									const errors = Array.isArray(err) ? err : [err];
									clientWs.send(
										JSON.stringify({
											id,
											type: "error",
											payload: errors,
										}),
									);
								},
								complete: () => {
									clientWs.send(
										JSON.stringify({
											id,
											type: "complete",
										}),
									);
								},
							},
						);
						subscriptions.set(`${id}:${name}`, unsubscribe);
					}
				}

				if (message.type === "complete") {
					const { id } = message;
					// Unsubscribe from all subgraphs for this subscription ID
					for (const [key, unsubscribe] of subscriptions) {
						if (key.startsWith(`${id}:`)) {
							unsubscribe();
							subscriptions.delete(key);
						}
					}
				}
			} catch (error) {
				gatewayLogger.error("Failed to process WebSocket message", {
					error: (error as Error).message,
				});
			}
		});

		clientWs.on("close", () => {
			activeClients.delete(clientWs);
			// Clean up all subscriptions
			for (const unsubscribe of subscriptions.values()) {
				unsubscribe();
			}
			subscriptions.clear();
			// Dispose all upstream clients
			for (const client of upstreamClients.values()) {
				client.dispose();
			}
			upstreamClients.clear();
			gatewayLogger.debug("WebSocket client disconnected");
		});

		clientWs.on("error", (error) => {
			gatewayLogger.error("WebSocket error", { error: error.message });
		});
	});

	return {
		async start() {
			// Start WebSocket server first
			await new Promise<void>((resolve) => {
				httpServer.listen(port + 1, () => {
					gatewayLogger.info("WebSocket server started", {
						url: `ws://localhost:${port + 1}/graphql`,
					});
					resolve();
				});
			});

			// Start Apollo Gateway HTTP server
			const { url } = await startStandaloneServer(server, {
				listen: { port },
			});

			gatewayLogger.info("Apollo Gateway started", {
				httpUrl: url,
				wsUrl: `ws://localhost:${port + 1}/graphql`,
				subgraphs: subgraphs.map((sg) => sg.name),
			});
		},

		async stop() {
			gatewayLogger.info("Stopping Gateway");

			// Close all client connections
			for (const client of activeClients) {
				client.close();
			}
			activeClients.clear();

			// Close servers
			wsServer.close();
			httpServer.close();
			await server.stop();
		},
	};
}
